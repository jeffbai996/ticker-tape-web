import {useEffect,useState} from 'preact/hooks'
import {fetchPortfolioHistory,portfolioHistoryEndpoint} from '../lib/portfolioData.js'

export function usePortfolioHistory(id) {
 const [state,setState]=useState({id,data:null,error:false,pending:true})
 const [revision,refresh]=useState(0)
 const configured=!!portfolioHistoryEndpoint()
 useEffect(()=>{
  if(!configured || !id)return
  let live=true
  const controller=new AbortController()
  const timer=setTimeout(()=>controller.abort(),10000)
  setState({id,data:null,error:false,pending:true})
  fetchPortfolioHistory(id,{signal:controller.signal}).then(data=>{if(live)setState({id,data,error:false,pending:false})})
   .catch(()=>{if(live)setState({id,data:null,error:true,pending:false})}).finally(()=>clearTimeout(timer))
  return ()=>{live=false;clearTimeout(timer);controller.abort()}
 },[id,revision,configured])
 return {configured,...(state.id===id ? state : {data:null,error:false,pending:true}),refresh:()=>refresh(n=>n+1)}
}
