// Leave native undo/redo alone while editing a field, including inline text.
export function historyShortcut(event){
  if(event.defaultPrevented||event.isComposing||event.altKey||!(event.ctrlKey||event.metaKey)||event.key?.toLowerCase()!=='z')return null;
  const target=event.target;
  if(target?.isContentEditable||target?.closest?.('input,textarea,select,[role="textbox"]'))return null;
  return event.shiftKey?'redo':'undo';
}
