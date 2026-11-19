// Legacy scenarios use the same visible navigation as a person before touching
// controls moved into steps/categories. Explicit workflow coverage is separate.
export function useWorkflowNavigation(page){
  const original=page.locator.bind(page),actions=new Set(['click','fill','check','uncheck','selectOption']);
  async function reveal(locator){
    if(await locator.isVisible())return;
    await locator.waitFor({state:'attached'});
    if(await locator.getAttribute('data-view')==='intake'){
      await original('[data-view="editor"]').click();await original('[data-workflow="pedido"]').click();await original('#start-messages').click();return true;
    }
    const location=await locator.evaluate(el=>({view:el.closest('.view')?.id,pane:el.closest('.workflow-pane')?.id,gallery:el.closest('[id^="gallery-"]')?.id,inspector:el.closest('[data-inspector-panel]')?.dataset.inspectorPanel,advanced:!!el.closest('.style-advanced'),visual:!!el.closest('#visual-tools')}));
    if(location.view&&await original('#'+location.view).isHidden())await original(`[data-view="${location.view.replace('-view','')}"]`).click();
    if(location.visual)await original('[data-workflow="estilo"]').click();
    if(location.pane&&!location.visual)await original(`[data-workflow="${location.pane.replace('workflow-','')}"]`).click();
    if(location.gallery)await original(`[data-gallery="${location.gallery.replace('gallery-','')}"]`).click();
    if(location.inspector&&!location.visual&&location.pane==='workflow-edicao')await original(`[data-inspector="${location.inspector}"]`).click();
    if(location.advanced&&!await original('.style-advanced').evaluate(el=>el.open))await original('.style-advanced>summary').click();
    const details=await locator.evaluate(el=>{const items=[];for(let node=el.parentElement;node;node=node.parentElement)if(node.tagName==='DETAILS'&&!node.open)items.unshift(node.className);return items;});
    for(const name of details)await original('details.'+name.split(' ').join('.')+'>summary').click();
  }
  function wrap(locator){return new Proxy(locator,{get(target,key){const value=Reflect.get(target,key,target);if(typeof value!=='function')return value;if(actions.has(key))return async(...args)=>{if(await reveal(target))return;return value.apply(target,args);};if(['first','last','nth','filter','locator'].includes(key))return(...args)=>wrap(value.apply(target,args));return value.bind(target);}});}
  page.locator=(...args)=>wrap(original(...args));
}
