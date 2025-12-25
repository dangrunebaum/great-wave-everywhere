<script>
  import { onDestroy } from "svelte";
  let currentHeaderIndex = $state(0);
  let intervalId;

  const headerImages = [
    "/great-wave-everywhere/main-image.jpeg",
    "/great-wave-everywhere/Hokusai-Great_Wave_off_Kanagawa-cat-end.jpg",
    "/great-wave-everywhere/tomoko_nagao_hokusai-the_great_wave_of_kanagawa_with_mc_cupnoodle_kewpie_kikkoman_and_kitty_2012_digital_art_50_x_70_cm-_70_x_100_cm.jpe_3.jpg",
    "/great-wave-everywhere/135e9cb8ff232a9c7e1f1be108eb670f.jpg",
    "/great-wave-everywhere/2372ef58832305.5a0b25df284b7.jpg.webp",
    "/great-wave-everywhere/image_BT0qjFvT31.png.jpeg",
  ];

  onMount(() => {
    intervalId = setInterval(() => {
      currentHeaderIndex = (currentHeaderIndex + 1) % headerImages.length;
    }, 5000);
  });
  onDestroy(() => {
    clearInterval(intervalId);
  });
  import { fetchWords, updateWord, fetchTrendingWords } from "./api";

  import { onMount } from "svelte";
  import axios from "axios";
  import * as d3 from "d3";
  import * as topojson from "topojson-client";

  // FIXED: Return null if url is missing so we don't match empty strings
  function normalizeUrl(url) {
    if (!url) return null;
    try {
      // This removes protocol (http), query strings (?abc=123), and trailing slashes
      const clean = url
        .replace(/^https?:\/\//, "")
        .split("?")[0]
        .replace(/\/$/, "");
      return clean;
    } catch (e) {
      return null;
    }
  }

  function getDomain(url) {
    if (!url) return null;
    try {
      // If it's already a domain (no http), the URL constructor might fail,
      // so we ensure it has a protocol for parsing.
      const fullUrl = url.startsWith("http") ? url : `https://${url}`;
      return new URL(fullUrl).hostname;
    } catch (e) {
      // Fallback: if URL parsing fails, return the raw string
      return url;
    }
  }

  let isHovered = $state(null);
  let images = $state([]);
  let userQuery = $state("");
  let nodes = $state([]);
  let links = $state([]);
  let simulation;
  let trending = $state([]);
  let loading = $state(false);
  let serverLocations = $state([]);
  let worldMapData = $state(null);

  let hoveredLocationText = $state("");

  async function loadWorldMap() {
    try {
      // console.log("Loading world map data...");
      const response = await fetch(
        "/great-wave-everywhere/ne_110m_admin_0_countries.json"
      );

      // console.log("Fetch response:", response.status, response.statusText);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const topoData = await response.json();
      // console.log("TopoJSON data loaded");
      // console.log("Objects in topology:", Object.keys(topoData.objects));

      // Convert TopoJSON to GeoJSON
      const objectName = Object.keys(topoData.objects)[0];
      worldMapData = topojson.feature(topoData, topoData.objects[objectName]);
      // console.log("Converted to GeoJSON format");
      // console.log("Number of countries:", worldMapData.features.length);
    } catch (error) {
      // console.error("Error loading world map data:", error);
      // Try alternative path
      try {
        // console.log("Trying alternative path...");
        const response = await fetch("/ne_110m_admin_0_countries.json");
        if (response.ok) {
          const topoData = await response.json();
          const objectName = Object.keys(topoData.objects)[0];
          worldMapData = topojson.feature(
            topoData,
            topoData.objects[objectName]
          );
          // console.log("World map loaded from alternative path");
        }
      } catch (altError) {
        // console.error("Alternative path also failed:", altError);
      }
    }
  }

  // 🔁 Load existing words from Firestore on mount
  onMount(async () => {
    loading = true;
    try {
      try {
        nodes = await fetchWords();
        trending = await fetchTrendingWords(5);
        buildLinks();
        restartSimulation();
      } catch (firebaseError) {
        console.warn("Firebase connection failed:", firebaseError);
        // Continue with empty data
        nodes = [];
        trending = [];
      }
      await loadWorldMap();
    } finally {
      loading = false;
    }
  });

  // Fetch images based on user query and update geolocation data
  async function fetchImages() {
    if (!userQuery) return;

    loading = true;
    try {
      const response = await axios.get(
        `https://great-wave-api-1muq.onrender.com/api/images?q=${userQuery}`
      );
      images = response.data;
      // console.log("Fetched images:", images);
      const imageUrls = images.map((img) => img.link).filter(Boolean);
      // console.log("Image URLs:", imageUrls);

      // Call backend geolocation API
      let geoData = [];
      if (imageUrls.length > 0) {
        try {
          const geoResponse = await axios.post(
            "https://great-wave-api-1muq.onrender.com/api/geolocate",
            { urls: imageUrls }
          );
          geoData = geoResponse.data;
          console.log("Geolocation API data:", geoData);
        } catch (geoError) {
          // console.error("Geolocation API error:", geoError);
        }
      }
      // Filter out locations with null/undefined or (0,0) coordinates
      serverLocations = geoData.filter((loc) => {
        if (loc == null) return false;
        const lat = Number(loc.lat);
        const lng = Number(loc.lng);
        if (isNaN(lat) || isNaN(lng)) return false;
        // Exclude (0,0) and nullish
        if (lat === 0 && lng === 0) return false;
        return true;
      });
      // console.log("Final server locations:", serverLocations);

      try {
        await updateWord(userQuery); // 🔼 update Firestore
        nodes = await fetchWords(); // ⬇️ re-fetch updated nodes
        trending = await fetchTrendingWords(5);
        buildLinks();
        restartSimulation();
      } catch (firebaseError) {
        console.warn("Firebase update failed:", firebaseError);
        // Continue without updating word cloud
      }

      userQuery = "";
    } catch (error) {
      console.error("Error fetching images", error);
    } finally {
      loading = false;
    }
  }

  // Word cloud functions
  function buildLinks() {
    links = [];
    for (let i = 1; i < nodes.length; i++) {
      links.push({ source: nodes[i - 1].id, target: nodes[i].id });
    }
  }

  function restartSimulation() {
    // Find the maximum count to normalize the gravity force
    const maxCount = Math.max(...nodes.map((n) => n.count));

    simulation = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3
          .forceLink(links)
          .id((d) => d.id)
          .distance(25)
      )
      .force("charge", d3.forceManyBody().strength(-100)) // reduced repulsion
      .force("center", d3.forceCenter(200, 300)) // center in SVG (400x600)
      .force(
        "gravity",
        d3
          .forceRadial(
            (d) => {
              // Higher count = smaller radius (closer to center)
              const normalizedCount = d.count / maxCount;
              return 150 * (1 - normalizedCount); // 0-100px from center based on count
            },
            200,
            300
          )
          .strength(0.5)
      ) // stronger gravity force
      .force("boundary", () => {
        // Keep nodes within SVG bounds
        nodes.forEach((node) => {
          node.x = Math.max(20, Math.min(380, node.x || 0));
          node.y = Math.max(20, Math.min(580, node.y || 0));
        });
      })
      .on("tick", () => {
        nodes = [...nodes];
      });
  }

  function getNodeById(id) {
    return nodes.find((node) => node.id === id);
  }

  function getLinkCoordinates(link) {
    const sourceNode = getNodeById(link.source);
    const targetNode = getNodeById(link.target);
    return {
      x1: sourceNode?.x || 0,
      y1: sourceNode?.y || 0,
      x2: targetNode?.x || 0,
      y2: targetNode?.y || 0,
    };
  }
</script>

<main>
  {#if loading}
    <div class="loading-indicator">Loading...</div>
  {/if}

  <!-- HEADER -->
  <div class="header">
    <div class="header-image-crossfade">
      {#each headerImages as img, i}
        <img
          src={img}
          alt="Header image"
          class:visible={currentHeaderIndex === i}
          class:hidden={currentHeaderIndex !== i}
        />
      {/each}
    </div>
    <div>
      <!-- MAIN BODY -->
      <div class="title">
        GREAT WAVE <span style="color: #F0BF91;"> REMIX</span>
      </div>

      <p class="subtitle">
        Discover Hokusai's "Great Wave off Kanagawa" in diverse and unexpected
        contexts worldwide. Search for any term to see how this iconic Japanese
        artwork has been reimagined in images spanning nations and cultures.
      </p>
    </div>
  </div>
  <div class="header-piping"></div>

  <h1>
    HOKUSAI'S <em class="italic">GREAT WAVE</em> CAN BE
    <input
      type="text"
      bind:value={userQuery}
      placeholder="ANYTHING"
      onkeydown={(e) => {
        if (e.key === "Enter") fetchImages();
      }}
    />
    <div class="search-container">
      <div class="button-wrapper">
        <button onclick={fetchImages}>Search</button>
      </div>
      <div class="call-to-action">No images yet — try a search!</div>
    </div>
  </h1>
  <div class="main-grid">
    <div class="left-column">
      <!-- WORLD MAP COMPONENT -->
      <div class="map-container">
        {#if images.length > 0 && worldMapData}
          {@const projection = d3
            .geoNaturalEarth1()
            .scale(40)
            .translate([100, 62.5])}
          {@const pathGenerator = d3.geoPath().projection(projection)}

          <svg width="200" height="125" viewBox="0 0 200 125" class="world-map">
            <!-- Render world countries -->
            {#each worldMapData.features as country, index}
              {@const pathData = pathGenerator(country)}
              {#if pathData}
                <path
                  d={pathData}
                  fill="#ADC2CE"
                  stroke="#377293"
                  stroke-width="0.5"
                />
              {:else}
                <!-- Debug: log countries with no path data -->
                {console.log(
                  `No path data for country ${index}:`,
                  country.geometry?.type
                )}
              {/if}
            {/each}

            <!-- Render server location pins -->
            {#if serverLocations.length > 0}
              {#each serverLocations as location}
                {console.log(location)}
                {@const coords = projection([location.lng, location.lat])}
                {#if coords}
                  <g
                    class="location-pin"
                    onmouseover={() => {
                      isHovered = location.domain;
                      hoveredLocationText =
                        location.city || location.country || "Unknown location";
                    }}
                    onmouseout={() => {
                      isHovered = null;
                      hoveredLocationText = "";
                    }}
                  >
                    <circle
                      class="pin"
                      cx={coords[0]}
                      cy={coords[1]}
                      r={isHovered === location.domain ? 7 : 4}
                      fill={isHovered === location.domain
                        ? "#ff4500"
                        : "#ff6b35"}
                    />
                  </g>
                {/if}
              {/each}
            {/if}
          </svg>
        {/if}
      </div>
      <!-- IMAGE GALLERY -->
      {#if images.length > 0}
        <div
          style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;"
        >
          <span style="color: #377293; font-weight: bold; font-size: 0.95rem;"
            >Rollover for image locations</span
          >
          {#if hoveredLocationText}
            <span style="color: #377293; font-weight: bold; font-size: 0.95rem;"
              >{hoveredLocationText}</span
            >
          {/if}
        </div>
        <div class="image-container">
          {#each images as img}
            <div class="image-with-title">
              <a href={img.link} target="_blank" rel="noopener noreferrer">
                <img
                  src={img.link}
                  onmouseover={() => {
                    isHovered = getDomain(img.link);
                    // Find the matching server location for this image
                    const loc = serverLocations.find(
                      (l) => l.domain === isHovered
                    );
                    hoveredLocationText = loc
                      ? loc.city ||
                        loc.country ||
                        loc.domain ||
                        "Unknown location"
                      : isHovered || "Unknown location";
                    console.log("Hovered Domain:", isHovered);
                  }}
                  onmouseout={() => {
                    isHovered = null;
                    hoveredLocationText = "";
                  }}
                  style="border: {isHovered === getDomain(img.link)
                    ? '2px solid #ff6b35'
                    : 'none'};"
                />
              </a>
              <div
                class="image-title-box"
                style="background: {isHovered === normalizeUrl(img.link)
                  ? '#ffe5d0'
                  : '#f9f9f9'};"
              >
                {@html `<textarea readonly rows='2'>${img.title}</textarea>`}
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="no-images-placeholder">
          <p>Your search results will appear here</p>
        </div>
      {/if}
    </div>

    <div class="right-column">
      <div class="word-cloud-container">
        <h3>Trending topics</h3>
        <svg width="100%" height="400" viewBox="0 0 400 400">
          <!-- Define drop shadow filter -->
          <defs>
            <filter
              id="dropshadow"
              x="-20%"
              y="-20%"
              width="140%"
              height="140%"
            >
              <feDropShadow
                dx="1"
                dy="1"
                stdDeviation="1"
                flood-opacity="0.3"
              />
            </filter>
          </defs>
          <g style="transform: translate(0, -100px)">
            <!-- Render links -->
            {#each links as link}
              <!-- {console.log(link)} -->

              {#if getNodeById(link.source) && getNodeById(link.target)}
                <line
                  x1={getLinkCoordinates(link).x1}
                  y1={getLinkCoordinates(link).y1}
                  x2={getLinkCoordinates(link).x2}
                  y2={getLinkCoordinates(link).y2}
                  stroke="#fff"
                  stroke-opacity="0.6"
                  stroke-width="2"
                />
              {/if}
            {/each}

            <!-- Render nodes as text -->
            {#each nodes as node}
              <text
                x={node.x}
                y={node.y}
                font-size={`${10 * node.count}px`}
                fill="steelblue"
                text-anchor="middle"
                alignment-baseline="middle"
                filter="url(#dropshadow)"
                onmouseover={() => console.log(node.id)}
              >
                {node.id}
              </text>
            {/each}
          </g>
        </svg>

        <div class="trending-panel">
          <ul>
            {#each trending as word}
              <li>{word.id} <span class="count">({word.count})</span></li>
            {/each}
          </ul>
        </div>
      </div>
    </div>
  </div>
  <h2>
    Google Ngram Viewer shows a steady rise in mentions of "Great Wave off
    Kanagawa"
  </h2>
  <div class="bottom-panel">
    <div class="chart-container">
      <iframe
        name="ngram_chart"
        src="https://books.google.com/ngrams/interactive_chart?content=Great+Wave+off+Kanagawa&year_start=1800&year_end=2022&corpus=en&smoothing=3"
        width="900"
        height="400"
        marginwidth="50"
        marginheight="0"
        hspace="0"
        vspace="0"
        frameborder="0"
        scrolling="no"
      ></iframe>
    </div>
  </div>
</main>

<style>
  .header-image-crossfade {
    position: relative;
    width: 100%;
    max-width: 100%;
    height: 200px;
    min-width: 300px;
    min-height: 100px;
  }
  .header-image-crossfade img {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 2px;
    box-shadow:
      2px 4px 12px rgba(0, 0, 0, 0.15),
      0 2px 4px rgba(0, 0, 0, 0.1);
    transition: opacity 1.2s cubic-bezier(0.4, 0, 0.2, 1);
    opacity: 0;
    z-index: 1;
  }
  .header-image-crossfade img.visible {
    opacity: 1;
    z-index: 2;
    pointer-events: auto;
  }
  .header-image-crossfade img.hidden {
    opacity: 0;
    z-index: 1;
    pointer-events: none;
  }
  @import url("https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400&family=Montserrat:wght@300;400;500;600;700&display=swap");

  title,
  .map-caption {
    font-family: montserrat, sans-serif;
    font-size: 0.9rem;
    color: #377293;
  }
  h3 {
    font-family: monserrat, sans-serif;
    font-size: 1.5rem;
    margin: 0;
    padding: 0;
    color: #377293;
  }
  .title {
    font-family: monserrat, sans-serif;
    font-size: 3.8rem;
    font-weight: 800;
    color: #377293;
  }
  .subtitle {
    font-family: monserrat, sans-serif;
    font-size: 1.1rem;
    font-weight: 300;
    color: #377293;
  }
  .header {
    display: grid;
    grid-template-columns: minmax(300px, 1fr) 1.5fr;
    align-items: center;
    text-align: left;
    margin-bottom: 1.5rem;
    gap: 2rem;
    max-width: 1800px;
    width: 100%;
  }

  .header-piping {
    width: 100%;
    height: 2px;
    background: #adc2ce;
    border-radius: 2px;
    margin: 0.5rem 0 1.5rem 0;
    opacity: 0.5;
  }
  .bottom-panel {
    display: flex;
    justify-content: center;
    align-items: flex-start;
    width: 100%;
    padding: 2rem 1rem;
    box-sizing: border-box;
    margin-top: 2rem;
  }

  .chart-container {
    display: flex;
    justify-content: center;
    align-items: center;
  }

  iframe {
    border-radius: 10px;
    border: 1px solid #e9ecef;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    margin: 1rem 0;
  }

  .image-with-title {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .image-title-box textarea {
    font-family: montserrat, sans-serif;
    font-size: 12px;
    width: 180px;
    margin-top: 0.25rem;
    text-align: center;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: #f9f9f9;
    color: #222;
    padding: 2px 4px;
    resize: none;
    overflow-wrap: break-word;
    white-space: pre-wrap;
    box-sizing: border-box;
  }

  .loading-indicator {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.5);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2rem;
    z-index: 1000;
  }

  .italic {
    font-style: italic;
  }

  .main-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
    width: 100%;
    /* max-width: 1200px; */
    margin: 0 auto;
  }

  .left-column {
    display: flex;
    flex-direction: column;
    min-height: 600px;
  }

  .right-column {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .word-cloud-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .image-container {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 2fr));
    gap: 1rem;
    justify-items: center;
    align-items: start;
  }

  .no-images-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 300px;
    color: #377293;
    font-style: italic;
    text-align: center;
  }

  /* Responsive design */
  @media (max-width: 768px) {
    .main-grid {
      grid-template-columns: 1fr;
      gap: 1rem;
    }

    .header {
      grid-template-columns: 1fr;
      text-align: center;
      gap: 1.5rem;
    }

    .header img {
      max-width: 400px;
      margin: 0 auto;
    }

    .image-container {
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    }

    main {
      padding: 1rem 2rem;
    }
  }

  @media (max-width: 480px) {
    .header {
      gap: 1rem;
    }

    .header img {
      max-width: 300px;
    }

    .title {
      font-size: 2.5rem;
    }

    .subtitle {
      font-size: 1.2rem;
    }

    main {
      padding: 1rem;
    }
  }

  .image-container img {
    width: 100%; /* Make images fit their container */
    height: auto; /* Maintain aspect ratio */
    max-width: 300px; /* Optional: Limit maximum width */
    margin: 0; /* Remove extra margin */
  }

  input {
    width: 10%;
    padding: 0.5rem;
    margin: 1rem;
    border-radius: 5px;
    border: 1px solid #377293;
    background-color: #f7f1e4;
    color: #377293;
    font-size: 1rem;
    vertical-align: middle;
  }

  button {
    padding: 0.25rem 0.5rem;
    font-size: 1.1rem;
    background-color: #377293;
    color: white;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    vertical-align: middle;
  }

  .search-container {
    display: inline-flex;
    align-items: center;
    gap: 1rem;
    vertical-align: middle;
  }

  .button-wrapper {
    display: flex;
    align-items: center;
  }

  .call-to-action {
    color: #377293;
    font-size: 1rem;
    font-family: montserrat, sans-serif;
    display: flex;
    align-items: center;
  }

  button:hover {
    background-color: #0056b3;
  }

  h1 {
    color: #377293;
    font-size: 2rem;
    font-family: montserrat, sans-serif;
    text-align: left;
    margin: 0.5rem 0;
  }

  :global(#app) {
    background-color: #f7f1e4;
    min-height: 100vh;
  }

  :global(body) {
    background-color: #f7f1e4;
    font-family: montserrat, sans-serif;
    margin: 0;
    padding: 0;
  }

  main {
    background-color: #f7f1e4;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 1rem 5rem;
  }

  .header img {
    width: 100%;
    height: auto;
    max-width: 100%;
    max-height: 200px;
    margin: 0;
    box-shadow:
      2px 4px 12px rgba(0, 0, 0, 0.15),
      0 2px 4px rgba(0, 0, 0, 0.1);
    border-radius: 2px;
    object-fit: cover;
  }

  .image-container img {
    width: 100%;
    max-width: 300px;
    margin: 1rem;
  }

  svg {
    margin-top: 0.5rem;
    /* border: 1px solid #ccc; */
  }

  line {
    stroke: #fff;
    stroke-opacity: 1;
  }

  text {
    cursor: pointer;
    font-family: Arial, sans-serif;
    fill: #377293;
  }
  .trending-panel {
    background-color: #f7f1e4;
    color: #377293;
    border: 1px solid #e9ecef;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    padding: 1rem;
    border-radius: 10px;
    width: 200px;
    margin: 1rem;
    font-family: sans-serif;
  }

  h2 {
    font-size: 1.2rem;
    /* margin-bottom: 0.5rem; */
    color: #377293;
  }

  .trending-panel ul {
    list-style: none;
    padding: 0;
  }

  .trending-panel li {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.25rem;
    font-size: 1rem;
  }

  .trending-panel .count {
    color: #6c757d;
    font-size: 0.9rem;
  }

  .ngram-chart {
    border-radius: 10px;
    border: 2px solid #ccc;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
    margin: 1rem 0;
  }

  .map-container {
    position: relative;
    padding: 0;
    margin: 0;
    text-align: left;
  }

  .world-map {
    /* No background - show body background */
  }

  .location-pin .pin {
    cursor: pointer;
    transition: r 0.2s ease;
  }

  .location-pin:hover .pin {
    r: 6;
    fill: #ff4500;
  }

  .map-caption {
    margin-top: 0.5rem;
    font-size: 0.9rem;
    color: #666;
    font-style: italic;
  }

  .debug-info {
    background-color: #fff3cd;
    border: 1px solid #ffeaa7;
    padding: 0.5rem;
    margin: 0.5rem 0;
    border-radius: 4px;
    font-size: 0.8rem;
  }

  .debug-info p {
    margin: 0.2rem 0;
  }
</style>
