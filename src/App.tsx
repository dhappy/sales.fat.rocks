import React from 'react'
import './App.css'

export type Maybe<T> = T | null
export type Info = {
  title?: string
  image?: string
  price?: string
}

export function App() {
  const params = new URLSearchParams(window.location.search);
  const cid = params.get('cid');
  const [info, setInfo] = React.useState<Maybe<Info>>(null)

  React.useEffect(() => {
    if(cid) {
      const load = async () => {
        const res = await fetch(`https://ipfs.io/ipfs/${cid}`)
        setInfo(await res.json())
      }
      load()
    }
  }, [])


  return (
    <article>
      <header>
        <h1>{info?.title ?? '[𝑀𝑎𝑖𝑛 𝑇𝑖𝑡𝑙𝑒]'}</h1>
      </header>
      <main>
        <img src={info?.image} alt={info?.title}/>
        <h2>{info?.price}</h2>
        <form>
          <button>Buy</button>
        </form>
      </main>
      <footer></footer>
    </article>
  )
}

export default App
