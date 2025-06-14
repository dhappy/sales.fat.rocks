<script lang="ts">
  import JSON5 from 'json5'
  import { page } from '$app/state'

  let images = $state<Array<string>>([])
  let error = $state<string | null>(null)

  $effect(() => {
    try {
      let cid = page.url.searchParams.get('cid')
      if(!cid) {
        throw new Error('No `cid` query parameter specified.')
      }
      cid = cid.replace(/^ipfs:\/\//, '')
      const url = `https://w3s.link/ipfs/${cid}`
      fetch(url)
      .then((res) => {
        if(!res.ok) {
          throw new Error(
            `Can't retrieve "${url}" (${res.status}: ${res.statusText})`
          )
        }
        return res.text()
      })
      .then((data) => images = JSON5.parse(data))
    } catch(err) {
      error = (err as Error).message
    }
  })

  function toHTTP(url: string) {
    const [, cid, path] = url.match(/^ipfs:\/\/([^/]+)(?:\/(.*))$/) ?? []
    if(cid) {
      url = `https://w3s.link/ipfs/${cid}/${path}`
    }
    return url
  }
</script>

<svelte:head>
  <title>Smoker's Kit</title>
</svelte:head>

<header>
  <h1>Hemp Smoker's Deluxe Kit</h1>
</header>

<main>
  {#if error}
    <h2>{error}</h2>
  {/if}
  <ul id="images">
    {#each images as ipfsImage, idx}
      {@const image = toHTTP(ipfsImage)}
      {@const title = decodeURIComponent(image.replace(/^.*:\/\/[^/]+\/[^.]+\.(.+)\.(jpg|png)$/, '$1'))}
      <li class:first={idx === 0}><figure>
        <a
          href={image}
          target="_blank"
        >
          <img
            alt={title}
            src={image}
          />
        </a>
        <figcaption>{title}</figcaption>
      </figure></li>
    {/each}
  </ul>
</main>

<footer>
  <img src="weed.svg" alt="🍁"/>
</footer>

<style>
  @property --rotation {
    syntax: '<angle>';
    inherits: true;
    initial-value: 0deg;
  }

  :root {
    --border: 4px;
    box-sizing: border-box;
  }

  h1 {
    font-family: 'Brilliant Gemstone', sans-serif;
    font-size: clamp(55pt, 12vw, 88pt);
    color: transparent;
    background-clip: text;
    background-image: linear-gradient(var(--rotation), #ff7e5f, #199810);
    text-fill-color: transparent;
    -webkit-text-stroke-width: 3px;
    animation: spin 1s infinite linear;
  }

  h1, h2 {
    text-align: center;
  }

  @keyframes spin {
    to { --rotation: 360deg }
  }
  @keyframes reveal {
    from { scale: 0; opacity: 0 }
    25% { scale: 1; opacity: 1 }
    75% { scale: 1; opacity: 1 }
    to { scale: 0; opacity: 0 }
  }

  #images {
    display: flex;
    flex-direction: column;
    list-style: none;
    padding: 0;

    & li {
      padding: 0;
      container-type: inline-size;
      margin-bottom: 2rem;
    }
    & figure {
      margin: 0;
      padding-inline-start: var(--border);
      width: calc(100cqw - var(--border) * 2);
      display: flex;
      align-items: center;
      flex-direction: column;

      animation: reveal linear;
      animation-timeline: view();

      & figcaption {
        font-size: 18pt;
      }
    }
    & img {
      max-height: 75vh;
      max-width: 100cqw;
      display: inline-block;
      margin-inline: auto;
      border-radius: 4rem;
      border: var(--border) solid light-dark(#0047B6, #6DA6FF);
      transition: border-color 0.5s;

      &:hover {
        border-color: light-dark(#2900A0, #936DFF);
      }
    }

    & .first img {
      padding: 1rem;
      border-radius: 0;
    }
  }

  footer {
    display: flex;
    justify-content: center;

    & img {
      max-width: 15rem;
    }
  }
</style>