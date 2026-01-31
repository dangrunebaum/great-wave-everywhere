<script>
  // --- Imports ---
  import { onDestroy, onMount } from "svelte";
  import axios from "axios";
  import * as d3 from "d3";
  import * as topojson from "topojson-client";
  import {
    fetchWords,
    updateWord,
    fetchTrendingWords,
    fetchImagesForWord,
  } from "./api";
  // import { collection, getDocs } from "firebase/firestore";
  // import { db } from "./firebase";

  // --- State Variables ---
  let currentHeaderIndex = $state(0); // For rotating header images
  let intervalId; // Interval for header image rotation

  // --- Header Images ---
  const headerImages = [
    "/main-image.jpeg",
    "/Hokusai-Great_Wave_off_Kanagawa-cat-end.jpg",
    "/tomoko_nagao_hokusai-the_great_wave_of_kanagawa_with_mc_cupnoodle_kewpie_kikkoman_and_kitty_2012_digital_art_50_x_70_cm-_70_x_100_cm.jpe_3.jpg",
    "/135e9cb8ff232a9c7e1f1be108eb670f.jpg",
    "/2372ef58832305.5a0b25df284b7.jpg.webp",
    "/image_BT0qjFvT31.png.jpeg",
  ];

  // --- Header Image Rotation ---
  onMount(() => {
    intervalId = setInterval(() => {
      currentHeaderIndex = (currentHeaderIndex + 1) % headerImages.length;
    }, 5000);
  });
  onDestroy(() => {
    clearInterval(intervalId);
  });

  // --- Image Search and Word Cloud ---
  /**
   * When a word is clicked, fetch its images and replace the main images array
   */
  async function handleWordClick(word) {
    if (!word) return;
    loading = true;
    try {
      const response = await axios.get(
        `https://great-wave-api-1muq.onrender.com/api/images/multilang?q=${encodeURIComponent(word)}`,
      );
      images = response.data.filter((item) => item.image && item.image.link);

      // Geolocate image servers for multilingual results
      const imageUrls = images.map((item) => item.image.link).filter(Boolean);
      let geoData = [];
      if (imageUrls.length > 0) {
        try {
          const geoResponse = await axios.post(
            "https://great-wave-api-1muq.onrender.com/api/geolocate",
            { urls: imageUrls },
          );
          geoData = geoResponse.data;
        } catch (geoError) {
          // Geolocation API error
        }
      }
      serverLocations = geoData.filter((loc) => {
        if (loc == null) return false;
        const lat = Number(loc.lat);
        const lng = Number(loc.lng);
        if (isNaN(lat) || isNaN(lng)) return false;
        if (lat === 0 && lng === 0) return false;
        return true;
      });
      userQuery = "";
    } catch (error) {
      console.error("Error fetching images for word", error);
    } finally {
      loading = false;
    }
  }

  /**
   * Normalize a URL for domain matching
   */
  function normalizeUrl(url) {
    if (!url) return null;
    try {
      // Remove protocol, query strings, and trailing slashes
      const clean = url
        .replace(/^https?:\/\//, "")
        .split("?")[0]
        .replace(/\/$/, "");
      return clean;
    } catch (e) {
      return null;
    }
  }

  /**
   * Extract domain from a URL
   */
  function getDomain(url) {
    if (!url) return null;
    try {
      const fullUrl = url.startsWith("http") ? url : `https://${url}`;
      return new URL(fullUrl).hostname;
    } catch (e) {
      return url;
    }
  }

  // --- UI State ---
  let isHovered = $state(null); // Track hovered domain/location
  let images = $state([]); // Images from search
  let userQuery = $state(""); // User's search input
  let nodes = $state([]); // Word cloud nodes
  let links = $state([]); // Word cloud links
  let simulation; // D3 simulation
  let trending = $state([]); // Trending words
  let loading = $state(false); // Loading indicator
  let serverLocations = $state([]); // Geolocated image servers
  let worldMapData = $state(null); // GeoJSON for world map
  let hoveredLocationText = $state(""); // Tooltip for hovered location

  // --- World Map Loader ---
  async function loadWorldMap() {
    try {
      const response = await fetch("/ne_110m_admin_0_countries.json");
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const topoData = await response.json();
      const objectName = Object.keys(topoData.objects)[0];
      worldMapData = topojson.feature(topoData, topoData.objects[objectName]);
    } catch (error) {
      // Try alternative path
      try {
        const response = await fetch("/ne_110m_admin_0_countries.json");
        if (response.ok) {
          const topoData = await response.json();
          const objectName = Object.keys(topoData.objects)[0];
          worldMapData = topojson.feature(
            topoData,
            topoData.objects[objectName],
          );
        }
      } catch (altError) {
        // Both paths failed
      }
    }
  }

  // --- Initial Data Load ---
  /**
   * On mount, load words, trending topics, and world map
   */
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
        nodes = [];
        trending = [];
      }
      await loadWorldMap();
    } finally {
      loading = false;
    }
  });

  // --- Image Search ---
  /**
   * Fetch images for user query and update geolocation data
   */
  async function fetchImages() {
    if (!userQuery) return;
    loading = true;
    try {
      const response = await axios.get(
        `https://great-wave-api-1muq.onrender.com/api/images/multilang?q=${encodeURIComponent(userQuery)}`,
      );
      // response.data is an array of { language, languageCode, query, image: { link, title, thumbnail } }
      images = response.data.filter((item) => item.image && item.image.link);

      // Geolocate image servers for multilingual results
      const imageUrls = images.map((item) => item.image.link).filter(Boolean);
      let geoData = [];
      if (imageUrls.length > 0) {
        try {
          const geoResponse = await axios.post(
            "https://great-wave-api-1muq.onrender.com/api/geolocate",
            { urls: imageUrls },
          );
          geoData = geoResponse.data;
        } catch (geoError) {
          // Geolocation API error
        }
      }
      serverLocations = geoData.filter((loc) => {
        if (loc == null) return false;
        const lat = Number(loc.lat);
        const lng = Number(loc.lng);
        if (isNaN(lat) || isNaN(lng)) return false;
        if (lat === 0 && lng === 0) return false;
        return true;
      });

      // Update word cloud
      try {
        await updateWord(userQuery); // Update Firestore
        nodes = await fetchWords(); // Re-fetch updated nodes
        trending = await fetchTrendingWords(5);
        buildLinks();
        restartSimulation();
      } catch (firebaseError) {
        console.warn("Firebase update failed:", firebaseError);
      }
      userQuery = "";
    } catch (error) {
      console.error("Error fetching images", error);
    } finally {
      loading = false;
    }
  }

  // --- Word Cloud Graph ---
  /**
   * Build links between word cloud nodes
   */
  function buildLinks() {
    links = [];
    for (let i = 1; i < nodes.length; i++) {
      links.push({ source: nodes[i - 1].id, target: nodes[i].id });
    }
  }

  /**
   * Restart D3 simulation for word cloud
   */
  function restartSimulation() {
    const maxCount = Math.max(...nodes.map((n) => n.count));
    simulation = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3
          .forceLink(links)
          .id((d) => d.id)
          .distance(25),
      )
      .force("charge", d3.forceManyBody().strength(-100))
      .force("center", d3.forceCenter(200, 300))
      .force(
        "gravity",
        d3
          .forceRadial(
            (d) => {
              const normalizedCount = d.count / maxCount;
              return 150 * (1 - normalizedCount);
            },
            200,
            300,
          )
          .strength(0.5),
      )
      .force("boundary", () => {
        nodes.forEach((node) => {
          node.x = Math.max(20, Math.min(380, node.x || 0));
          node.y = Math.max(20, Math.min(580, node.y || 0));
        });
      })
      .on("tick", () => {
        nodes = [...nodes];
      });
  }

  /**
   * Get node by ID from word cloud
   */
  function getNodeById(id) {
    return nodes.find((node) => node.id === id);
  }

  /**
   * Get coordinates for a link between nodes
   */
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

  <!-- Download Words Collection button removed as saving is no longer needed -->

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
      <!-- HEADER -->
      <div class="title">
        GREAT WAVE <span style="color: #F0BF91;"> REMIX</span>
      </div>

      <p class="subtitle">
        Discover Hokusai's "Great Wave off Kanagawa" in unexpected contexts
        worldwide. Search Google Images for any term you associate with this
        iconic Japanese artwork to see how it has been reimagined in formats
        spanning diverse topics and cultures.
      </p>
    </div>
  </div>
  <div class="header-piping"></div>

  <!-- MAIN BODY -->
  <h1 style="display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;">
    HOKUSAI'S <em class="italic">GREAT WAVE</em> CAN BE
    <span style="display: flex; align-items: center; gap: 0.5rem;">
      <input
        type="text"
        bind:value={userQuery}
        placeholder="ANYTHING"
        onkeydown={(e) => {
          if (e.key === "Enter") fetchImages();
        }}
        style="margin-left: 0.5rem;"
      />
      <button onclick={fetchImages}>Search</button>
    </span>
  </h1>

  <div class="search-container search-container-below-h1">
    <div class="call-to-action">
      No images yet — enter a search term above! <br /> (First search may take several
      seconds while the server wakes.)
    </div>
  </div>
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
                  country.geometry?.type,
                )}
              {/if}
            {/each}

            <!-- Render server location pins -->
            {#if serverLocations.length > 0}
              {#each serverLocations as location}
                <!-- {console.log(location)} -->
                {@const coords = projection([location.lng, location.lat])}
                {#if coords}
                  <g
                    class="location-pin"
                    onmouseover={() => {
                      isHovered = location.domain;
                      hoveredLocationText = location.domain || "Unknown domain";
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
                      style="pointer-events: none;"
                    />
                  </g>
                {/if}
              {/each}
            {/if}
          </svg>
        {/if}
      </div>
      <!-- IMAGE GALLERY: Show images from search or word click -->
      {#if images.length > 0}
        <div
          style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;"
        >
          <span style="color: #377293; font-weight: bold; font-size: 0.95rem;"
            >Hover for image server locations:</span
          >
          {#if hoveredLocationText}
            <span style="color: #377293; font-weight: bold; font-size: 0.95rem;"
              >{hoveredLocationText}</span
            >
          {/if}
        </div>
        <div
          class="image-container grid-3x3"
          style="width: 100%; max-width: 900px; margin: 0 auto;"
        >
          {#each images.slice(0, 8) as img, i (`${img.image.link || "no-link"}-${i}`)}
            <div class="image-with-title">
              <a
                href={img.image.link}
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  src={img.image.link}
                  alt={img.image.title}
                  onerror={(e) => {
                    e.target.src = "";
                  }}
                  onmouseover={() => {
                    // Highlight the map pin for this image's domain
                    const domain = getDomain(img.image.link);
                    isHovered = domain;
                    const loc = serverLocations.find(
                      (l) => l.domain === domain,
                    );
                    hoveredLocationText = loc
                      ? loc.domain || "Unknown domain"
                      : domain || "Unknown domain";
                  }}
                  onmouseout={() => {
                    isHovered = null;
                    hoveredLocationText = "";
                  }}
                />
              </a>
              <div class="image-title-box">
                {img.image.title}
              </div>
            </div>
          {/each}
        </div>
      {/if}
      {#if images.length === 0}
        <div class="no-images-placeholder">
          <p>
            Enter a search term above to query Google Images for "Great Wave off
            Kanagawa + [your search term]." Your search results will appear
            here.
          </p>
        </div>
      {/if}
    </div>

    <!-- WORD CLOUD AND TRENDING TOPICS -->
    <div class="right-column">
      <div class="word-cloud-container">
        <div class="call-to-action">Or click on a trending topic!</div>
        <svg width="120%" height="400" viewBox="0 0 480 400">
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
              {@const minCount = Math.min(...nodes.map((n) => n.count))}
              {@const maxCount = Math.max(...nodes.map((n) => n.count))}
              {@const t =
                (node.count - minCount) / Math.max(1, maxCount - minCount)}
              {@const color =
                t < 0.7
                  ? d3.interpolateLab("#ADC2CE", "#377293")(t / 0.7)
                  : d3.interpolateLab("#377293", "#ff6b35")((t - 0.7) / 0.3)}
              <text
                x={node.x}
                y={node.y}
                font-size={`${8 + node.count}px`}
                fill={color}
                text-anchor="middle"
                alignment-baseline="middle"
                filter="url(#dropshadow)"
                onclick={() => handleWordClick(node.id)}
                onmouseover={(e) => {
                  e.target.style.fill = "#ff6b35";
                  e.target.style.cursor = "pointer";
                }}
                onmouseout={(e) => {
                  e.target.style.fill = color;
                }}
                style="cursor: pointer;"
              >
                {node.id}
              </text>
            {/each}
          </g>
        </svg>

        <div class="trending-panel">
          <ul>
            {#each trending as word}
              <li
                onclick={() => handleWordClick(word.id)}
                style="cursor:pointer;"
              >
                {word.id} <span class="count">({word.count})</span>
              </li>
            {/each}
          </ul>
        </div>
      </div>
    </div>
  </div>

  <!-- GOOGLE NGRAM VIEWER SECTION -->
  <div style="text-align: left; color: #377293; padding-top: 5rem;">
    <!-- <h2>
      Google Ngram Viewer shows a steady rise in mentions of "Great Wave off
      Kanagawa"
    </h2> -->
    <h2>Why remix the "Great Wave?"</h2>
    This project explores the impact of Hokusai's iconic artwork, allowing users
    to see for themselves how it continues to reverberate worldwide. Two centuries
    since its creation around 1831, scholars say Hokusai’s print is possibly the
    most reproduced image in the history of art, with global recognition far beyond
    its original Japanese audience.
  </div>
  <div class="bottom-panel">
    <div class="chart-container">
      <div>
        <p>
          The exponential-like rise in frequency of the phrase “Great Wave off
          Kanagawa” in millions of Google Books shows references to the artwork
          appearing more frequently over time, reflecting Japan's rise as a
          cultural superpower.
        </p>
        <p>
          The print helped spark Japonisme in the West (influencing Monet, van
          Gogh, and others), and that early cultural exchange laid the
          foundation for global fame. European artists and critics rediscovered
          Japanese woodblocks after Japan opened to trade in the 19th century,
          elevating Hokusai’s work in Western art circles.
        </p>
        <p>
          "Great Wave" now appears everywhere — from high fashion and novelty
          goods to digital art, emojis, and even LEGO sets. It was chosen for
          the 2024 Japanese 1,000-yen note — a highly public national symbol.
        </p>
      </div>
      <div>
        <p class="chart-title">
          Mentions of "Great Wave off Kanagawa" over time
        </p>
        <img
          src="/ngram_chart_great_wave_off_kanagawa.png"
          alt="Google Ngram Viewer chart for 'Great Wave off Kanagawa'"
          class="ngram-chart"
        />
        <p class="source">
          Source: Google Books Ngram Viewer, English corpus, 1900–2022
        </p>
      </div>
      <!-- <iframe
        name="ngram_chart"
        src="https://books.google.com/ngrams/interactive_chart?content=Great+Wave+off+Kanagawa&year_start=1900&year_end=2022&corpus=en&smoothing=3"
        width="900"
        height="400"
        marginwidth="50"
        marginheight="0"
        hspace="0"
        vspace="0"
        frameborder="0"
        scrolling="no"
      ></iframe> -->
    </div>
  </div>
</main>

<style>
  .source {
    font-size: 0.7rem;
  }
  .header-image-crossfade {
    position: relative;
    width: 100%;
    aspect-ratio: 16/6;
    min-height: 100px;
    max-height: 300px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
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
    max-width: 100vw;
    max-height: 100%;
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
  /* Responsive adjustment for mobile */
  @media (max-width: 900px) {
    .header-image-crossfade {
      aspect-ratio: 16/9;
      min-height: 80px;
      max-height: 180px;
    }
  }
  @media (max-width: 600px) {
    .header-image-crossfade {
      aspect-ratio: 16/12;
      min-height: 60px;
      max-height: 120px;
    }
    .header-image-crossfade img {
      border-radius: 1px;
    }
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
    line-height: 3.8rem;
  }
  .subtitle {
    font-family: monserrat, sans-serif;
    font-size: 1.2rem;
    font-weight: 300;
    color: #377293;
  }
  .header {
    display: grid;
    grid-template-columns: minmax(300px, 1fr) 1.5fr;
    align-items: start;
    text-align: left;
    /* margin-bottom: 1.5rem; */
    gap: 2rem;
    max-width: 1800px;
    width: 100%;
  }

  .header-piping {
    width: 100%;
    height: 2px;
    background: #adc2ce;
    border-radius: 2px;
    margin: 0rem 0 1.5rem 0;
    opacity: 0.5;
  }

  /* .bottom-panel {
    display: flex;
    justify-content: center;
    align-items: flex-start;
    width: 100%;
    margin-top: 2rem;
  } */

  .chart-container {
    display: grid;
    grid-template-columns: 35% 65%;
    gap: 1rem;
    width: 100%;
    /* max-width: 1000px; */
    /* margin: 0 auto; */
    /* padding: 0 2rem 0 0; */
  }
  .chart-title {
    font-weight: 700;
    text-align: center;
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
    justify-content: flex-start;
    margin-left: auto;
    margin-right: auto;
  }
  .image-with-title img {
    display: block;
    width: 180px;
    height: auto;
    margin: 0 auto;
  }

  .image-title-box {
    font-family: montserrat, sans-serif;
    font-size: 10px;
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
  h2,
  p {
    color: #377293;
    text-align: left;
  }
  .main-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
    width: 100%;
    max-width: 1800px;
    margin: 0 auto;
    /* Responsive, centered, not too wide */
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
    width: 120%;
    max-width: 480px;
  }

  .grid-3x3 {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: repeat(3, auto);
    gap: 1.2rem 1.2rem;
    justify-items: center;
    align-items: center;
    margin-bottom: 1.5rem;
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
  @media (max-width: 800px) {
    .chart-container {
      width: 100%;
      padding: 0 0.5rem;
    }
    .header {
      display: grid;
      grid-template-columns: none;
      grid-template-rows: auto auto;
      text-align: center;
      gap: 1.5rem;
    }
    .header img {
      max-width: 400px;
      margin: 0 auto;
    }
    .main-grid {
      display: grid;
      grid-template-columns: none;
      grid-template-rows: auto auto;
      gap: 1.5rem;
      width: 100%;
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
    width: 100%;
    height: auto;
    max-width: 300px;
    margin: 0;
    transition:
      transform 0.35s cubic-bezier(0.4, 0, 0.2, 1),
      box-shadow 0.25s;
    box-shadow: 2px 4px 12px rgba(0, 0, 0, 0.12);
    border-radius: 6px;
    cursor: pointer;
    z-index: 1;
  }

  .image-container img:hover {
    transform: scale(1.18);
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.22),
      0 2px 8px rgba(0, 0, 0, 0.12);
    z-index: 2;
  }

  input {
    width: 7rem;
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
  .search-container-below-h1 {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1.5rem;
    margin-top: -1rem;
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
    font-weight: bold;
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
    padding: 1rem 1rem;
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
    margin-bottom: 0.05rem;
    font-size: 0.8rem;
  }

  .trending-panel .count {
    color: #6c757d;
    font-size: 0.9rem;
  }

  .ngram-chart {
    width: 100%;
  }

  .map-container {
    position: relative;
    padding: 0;
    margin: 0;
    text-align: left;
  }

  .location-pin .pin {
    cursor: pointer;
    transition: r 0.2s ease;
  }

  .location-pin:hover .pin {
    r: 6;
    fill: #ff4500;
  }
</style>
