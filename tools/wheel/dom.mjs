import {describeWheel,renderWheelSvg} from './index.mjs';
let sequence = 0;
/** Creates detached, keyboard-operable DOM. No network, storage, URL or global document reads. */
export function createWheel(data, {document: doc, title = 'Chart wheel'} = {}) {
  if (!doc?.createElement || !doc?.createElementNS) throw new TypeError('A DOM document is required');
  const d = describeWheel(data);
  let prefix;
  do { prefix = 'zodiacs-wheel-' + (++sequence); } while (doc.getElementById(prefix+'-title') || doc.getElementById(prefix+'-desc') || doc.getElementById(prefix+'-selected'));
  const svgMarkup=renderWheelSvg(d.model,{idPrefix:prefix,title});
  const el = (tag,value) => { const node=doc.createElement(tag); if(value!==undefined) node.textContent=value; return node; };
  const figure=el('figure'); figure.style.margin='0'; figure.style.fontFamily='system-ui,sans-serif'; figure.style.lineHeight='1.5';figure.style.overflowWrap='anywhere';
  const caption=el('figcaption',title + ' · ' + d.zodiac + (d.model.engineVersion ? ' · Engine ' + d.model.engineVersion : ''));
  // Parse only the internally generated, escaped SVG. Caller strings never become markup.
  const template=el('template'); template.innerHTML=svgMarkup;
  const svg=template.content.firstElementChild;
  figure.append(caption,svg);
  const instructions=el('p','Use Tab to reach the body controls. Arrow keys move between bodies; Home and End reach the first and last. Enter or Space selects a body.');
  const list=el('ul'); list.setAttribute('aria-label','Chart bodies');
  const selected=el('p'); selected.id=prefix+'-selected'; selected.setAttribute('role','status'); selected.setAttribute('aria-live','polite');
  const buttons=[];
  const select=(i,focus)=>{
    buttons.forEach((b,k)=>{b.tabIndex=k===i?0:-1;b.setAttribute('aria-pressed',String(k===i));});
    svg.querySelectorAll('[data-body-index]').forEach((node,k)=>{node.setAttribute('r',k===i?'8':'5');node.setAttribute('fill',k===i?'none':'currentColor');node.setAttribute('stroke-width',k===i?'3':'1');});
    const body=d.bodies[i], related=d.aspects.filter(a=>a.a===body.body||a.b===body.body);
    selected.textContent=body.description + '. ' + (related.length ? related.map(a=>a.description + '.').join(' ') : 'No listed aspects.');
    if(focus) buttons[i].focus();
  };
  d.bodies.forEach((b,i)=>{
    const li=el('li'),button=el('button',b.description);button.type='button'; button.style.minHeight='44px';button.style.margin='4px';button.style.padding='8px 12px';button.style.font='inherit';button.style.boxSizing='border-box';button.style.maxWidth='calc(100% - 8px)';
    button.addEventListener('click',()=>select(i,false));
    button.addEventListener('keydown',event=>{
      let next;
      if(event.key==='ArrowRight'||event.key==='ArrowDown') next=(i+1)%buttons.length;
      else if(event.key==='ArrowLeft'||event.key==='ArrowUp') next=(i+buttons.length-1)%buttons.length;
      else if(event.key==='Home') next=0;
      else if(event.key==='End') next=buttons.length-1;
      else return;
      event.preventDefault();select(next,true);
    });
    buttons.push(button);li.append(button);list.append(li);
  });
  figure.append(instructions,list,selected);
  const table=(label,rows)=>{
    const t=el('table');t.style.width='100%';t.style.tableLayout='fixed';t.append(el('caption',label));
    const head=el('thead'),hr=el('tr'),th=el('th','Description');th.scope='col';hr.append(th);head.append(hr);t.append(head);
    const body=el('tbody');for(const row of rows){const tr=el('tr');tr.append(el('td',row.description));body.append(tr);}t.append(body);figure.append(t);
  };
  if(d.angles.length) table('Angles',d.angles); else figure.append(el('p','No angles are supplied.'));
  if(d.houses.length) table('House cusps · '+d.model.houses.system,d.houses); else figure.append(el('p','No houses are supplied.'));
  if(d.aspects.length) table('Listed aspects',d.aspects); else figure.append(el('p','No aspects are supplied.'));
  if(d.model.flags.length) figure.append(el('p','Flags: '+d.model.flags.join(', ')));
  select(0,false);
  return figure;
}
