<script>
  import { fetchWords, updateWord, fetchTrendingWords } from './api'

  import { onMount } from "svelte"
  import axios from "axios"
  import * as d3 from "d3"

  let images = []
  let userQuery = ""
  let nodes = []
  let links = []
  let simulation
    let trending = []

  // 🔁 Load existing words from Firestore on mount
  onMount(async () => {
    nodes = await fetchWords()
    trending = await fetchTrendingWords(5)
    buildLinks()
    restartSimulation()
  })

  async function fetchImages() {
    if (!userQuery) return

    try {
      const response = await axios.get(`https://great-wave-api-1muq.onrender.com/api/images?q=${userQuery}`)
      images = response.data
      console.log("Fetched images:", images)

      await updateWord(userQuery)          // 🔼 update Firestore
      nodes = await fetchWords()           // ⬇️ re-fetch updated nodes
      trending = await fetchTrendingWords(5)
      buildLinks()
      restartSimulation()
      userQuery = ""
    } catch (error) {
      console.error("Error fetching images", error)
    }
  }

  function buildLinks() {
    links = []
    for (let i = 1; i < nodes.length; i++) {
      links.push({ source: nodes[i - 1].id, target: nodes[i].id })
    }
  }

  function restartSimulation() {
    simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(d => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(200, 300))
      .force("gravity", d3.forceRadial(d => 300 - d.count * 20, 200, 300))
      .on("tick", () => {
        nodes = [...nodes]
      })
  }

  function getNodeById(id) {
    return nodes.find(node => node.id === id)
  }

  function getLinkCoordinates(link) {
    const sourceNode = getNodeById(link.source)
    const targetNode = getNodeById(link.target)
    return {
      x1: sourceNode?.x || 0,
      y1: sourceNode?.y || 0,
      x2: targetNode?.x || 0,
      y2: targetNode?.y || 0
    }
  }
</script>


<main>
  <div class="trending-panel">
  <h2>🔥 Trending</h2>
  <ul>
    {#each trending as word}
      <li>{word.id} <span class="count">({word.count})</span></li>
    {/each}
  </ul>
</div>

    <h1><span>Hokusai's legendary </span><span  class="italic">"Great Wave off Kanagawa" </span><span> can be</span></h1>
    <input type="text" bind:value={userQuery} placeholder="anything" />
    <button on:click={fetchImages}>Search</button>
    <div class="container">
    {#if images.length > 0}
  <div class="image-container">
    {#each images as img}
      <img src={img.link} alt={img.title} />
    {/each}
  </div>
{:else}
  <p style="color:white;">No images yet — try a search above!</p>
{/if}

    <div>
    <svg width="400" height="600">
        <!-- Render links -->
        {#each links as link}
        <!-- {console.log(link)}        git add .
        git commit -m "Add detailed error logging to /api/images"
        git push -->
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
                font-size={`${10 + node.count}px`}
                fill="steelblue"
                text-anchor="middle"
                alignment-baseline="middle"
                on:mouseover={() => console.log(node.id)}
            >
                {node.id}
            </text>
        {/each}
    </svg>
    </div>
    </div>
</main>

<style>
    .italic {
        font-style: italic;
    }
.container {
        display: grid;
        grid-template-columns: 50% 50%;
        gap: 1rem;
        }
        .image-container {
        display: grid;
        grid-template-columns: repeat(2, 1fr); /* Two columns */
        gap: 1rem;
        justify-items: center; /* Center images horizontally */
        align-items: center; /* Center images vertically */
        }
    .image-container img {  
        width: 100%; /* Make images fit their container */
        height: auto; /* Maintain aspect ratio */
        max-width: 300px; /* Optional: Limit maximum width */
        margin: 0; /* Remove extra margin */
    }
    input {
        width: 200px;
        padding: 0.5rem;
        margin: 1rem;
        border-radius: 5px;
        border: 1px solid #ccc;
    }
    button {
        padding: 0.5rem 1rem;
        background-color: #007bff;
        color: white;
        border: none;
        border-radius: 5px;
        cursor: pointer;
    }
    button:hover {
        background-color: #0056b3;
    }

    h1 {
        color: antiquewhite;
    }
    main {
        background-color: #333;
        display: flex;
        flex-direction: column;
        align-items: center;
    }

    img {
        width: 100%;
        max-width: 300px;
        margin: 1rem;
    }

    svg {
        margin-top: 2rem;
        border: 1px solid #ccc;
    }

    line {
        stroke: #fff;
        stroke-opacity: 1;
    }

    text {
        cursor: pointer;
        font-family: Arial, sans-serif;
    }
    .trending-panel {
  background-color: #222;
  color: white;
  padding: 1rem;
  border-radius: 10px;
  width: 200px;
  margin: 1rem;
  font-family: sans-serif;
}

.trending-panel h2 {
  font-size: 1.2rem;
  margin-bottom: 0.5rem;
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
  color: #bbb;
  font-size: 0.9rem;
}

</style>