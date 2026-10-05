/* Bounded, session-only history of media adjustments. */
(function(root){
class EditHistory {
  constructor(limit=100){this.limit=limit;this.clear();}
  clear(){this.undoStack=[];this.redoStack=[];}
  record(before,after,group=null){
    if(JSON.stringify(before)===JSON.stringify(after))return false;
    const last=this.undoStack.at(-1);
    if(group&&last?.group===group){last.after=structuredClone(after);}
    else{this.undoStack.push({before:structuredClone(before),after:structuredClone(after),group});if(this.undoStack.length>this.limit)this.undoStack.shift();}
    this.redoStack=[];return true;
  }
  undo(){const step=this.undoStack.pop();if(!step)return null;this.redoStack.push(step);return structuredClone(step.before);}
  redo(){const step=this.redoStack.pop();if(!step)return null;this.undoStack.push(step);return structuredClone(step.after);}
}
root.EditHistory=EditHistory;
if(typeof module!=='undefined')module.exports=EditHistory;
})(globalThis);
