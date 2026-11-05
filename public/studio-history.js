// Bounded in-memory recipe history. No customer content is persisted in browser storage.
export function createDesignHistory({limit=40,clock=Date.now}={}){
 const past=[],future=[];let lastKey=null,lastAt=0;
 return {
  record(before,{key='',merge=false}={}){const at=clock();if(!(merge&&key===lastKey&&at-lastAt<900)){past.push(structuredClone(before));if(past.length>limit)past.shift();}future.length=0;lastKey=merge?key:null;lastAt=at;},
  undo(current){if(!past.length)return null;future.push(structuredClone(current));lastKey=null;return past.pop();},
  redo(current){if(!future.length)return null;past.push(structuredClone(current));lastKey=null;return future.pop();},
  clear(){past.length=0;future.length=0;lastKey=null;},
  get canUndo(){return past.length>0;},get canRedo(){return future.length>0;}
 };
}
