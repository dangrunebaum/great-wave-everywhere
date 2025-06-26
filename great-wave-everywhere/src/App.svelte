<script>
    import { onMount } from "svelte";
    import axios from "axios";
    import * as d3 from "d3";

    let images = [];
    let userQuery = "";
    let nodes = [];
    let links = [];
    let simulation;

    async function fetchImages() {
        try {
           const response = await axios.get(`https://great-wave-api-1muq.onrender.com/api/images?q=${userQuery}`);
            images = response.data;
            console.log("Fetched images:", images);
            
            addOrUpdateNode(userQuery);
        } catch (error) {
            console.error("Error fetching images", error);
        }
    }

    function addOrUpdateNode(query) {
        // Check if the node already exists
        const existingNode = nodes.find(node => node.id === query);

        if (existingNode) {
            // If the node exists, increment its count
            existingNode.count += 1;
        } else {
            // If the node doesn't exist, add it with an initial count of 1
            nodes = [...nodes, { id: query, count: 1 }];

            // Add a link to the previous node if it exists
            if (nodes.length > 1) {
                links = [...links, { source: nodes[nodes.length - 2].id, target: query }];
            }
        }

        // Restart the simulation whenever nodes or links are updated
        restartSimulation();
    }

    function restartSimulation() {
        // Initialize or update the D3 force simulation
        simulation = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(links).id(d => d.id).distance(100))
            .force("charge", d3.forceManyBody().strength(-200))
            .force("center", d3.forceCenter(200, 300)) // Center of the SVG
            .force("gravity", d3.forceRadial(d => 300 - d.count * 20, 200, 300)) // Pull higher-count nodes closer to the center
            .on("tick", () => {
                // Trigger Svelte reactivity by reassigning the nodes array
                nodes = [...nodes];
            });
    }

    // Function to calculate link positions
    function getNodeById(id) {
        return nodes.find(node => node.id === id);
    }

    function getLinkCoordinates(link) {
        const sourceNode = getNodeById(link.source);
        const targetNode = getNodeById(link.target);
        return {
            x1: sourceNode?.x || 0,
            y1: sourceNode?.y || 0,
            x2: targetNode?.x || 0,
            y2: targetNode?.y || 0
        };
    }

    onMount(() => {
        // Initialize the simulation when the component is mounted
        restartSimulation();
    });
</script>

<main>
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
</style>