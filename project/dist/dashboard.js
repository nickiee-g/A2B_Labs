// Mirror the existing workflow state and delegate navigation to its existing controls.
const workflow=document.createElement('nav');workflow.className='workflow-tabs';workflow.setAttribute('aria-label','Review steps');
['Get started','Review rules','Results & checks'].forEach((label,i)=>{const b=document.createElement('button');b.type='button';b.innerHTML=`<span>${i+1}</span>${label}`;b.addEventListener('click',()=>document.querySelector(`[data-step="${i}"]`).click());workflow.append(b)});
document.getElementById('content').before(workflow);
function updateWorkflow(){const buttons=workflow.querySelectorAll('button');buttons.forEach((b,i)=>{b.disabled=i===1?!analysis:i===2?!result:false;if(stage===i)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current')})}
new MutationObserver(updateWorkflow).observe(document.getElementById('content'),{childList:true});updateWorkflow();
