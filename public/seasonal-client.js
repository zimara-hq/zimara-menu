import{renderSeason}from'./seasonal.js';
// Preview is a visual-only parent message; public API date and availability stay server-owned.
export function seasonLayer(main,view){
 let live=null,preview,ready=false;
 const embedded=window.parent!==window&&new URLSearchParams(location.search).has('season_preview');
 function render(){renderSeason(main,preview===undefined?live:preview,{view});if(embedded&&!ready){ready=true;window.parent.postMessage({type:'zm-season-ready'},location.origin);}}
 const onMessage=event=>{if(!embedded||event.origin!==location.origin||event.source!==window.parent||event.data?.type!=='zm-season-preview')return;const value=event.data.season;if(value!==null&&(!value||typeof value!=='object'||Array.isArray(value)||typeof value.motif!=='string'))return;preview=value;render();};
 if(embedded)window.addEventListener('message',onMessage);
 return{set(value){live=value||null;render();},render};
}
