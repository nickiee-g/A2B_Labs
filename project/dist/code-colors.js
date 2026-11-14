// Lightweight display-only highlighting; source text is never interpreted as HTML.
function colorCode(text,language){
 const lang=String(language).toLowerCase(),python=lang.includes('python'),cobol=lang.includes('cobol');
 const keywords=new Set((python?'def return if elif else for in while import from as class try except finally raise with lambda pass and or not is None True False':cobol?'IF ELSE END-IF MOVE TO COMPUTE ADD SUBTRACT MULTIPLY DIVIDE BY GIVING EVALUATE WHEN END-EVALUATE PERFORM UNTIL DISPLAY ACCEPT PIC VALUE WORKING-STORAGE SECTION DIVISION PROGRAM-ID STOP RUN AND OR NOT':'SELECT FROM WHERE AS JOIN ON GROUP BY ORDER HAVING INSERT INTO VALUES UPDATE SET DELETE CREATE OR REPLACE PROCEDURE FUNCTION BEGIN END IF THEN ELSE ELSIF ELSEIF DECLARE IN OUT INOUT INT INTEGER VARCHAR DECIMAL NUMERIC BOOLEAN CASE WHEN RETURN RETURNS DELIMITER AND OR NOT NULL CALL GREATEST LEAST COALESCE').split(' '));
 const token=python?/(#[^\n]*|"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][\w]*\b|[+*/%=<>!:-]+)/g:/(\*>[^\n]*|--[^\n]*|\/\*[\s\S]*?\*\/|"(?:""|[^"])*"|'(?:''|[^'])*'|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][\w-]*\b|[+*/%=<>!:-]+)/g;
 let html='',at=0;for(const m of text.matchAll(token)){html+=esc(text.slice(at,m.index));const v=m[0];let type='';if(/^(#|\*>|--|\/\*)/.test(v))type='comment';else if(/^["']/.test(v))type='string';else if(/^\d/.test(v))type='number';else if(keywords.has(python?v:v.toUpperCase()))type='keyword';else if(/^[+*/%=<>!:-]+$/.test(v))type='operator';else if(/^\s*\(/.test(text.slice(m.index+v.length)))type='function';html+=type?`<span class="syntax-${type}">${esc(v)}</span>`:esc(v);at=m.index+v.length;}return html+esc(text.slice(at));
}
function decorateCode(){
 document.querySelectorAll('.code-panel pre').forEach((pre,i)=>{pre.classList.add('syntax-code');pre.innerHTML=colorCode(pre.textContent,i===0?language:target)});
 const input=document.getElementById('source');if(!input)return;
 const wrap=document.createElement('div');wrap.className='code-editor';input.before(wrap);wrap.append(input);
 const paint=document.createElement('pre');paint.className='syntax-code editor-paint';paint.setAttribute('aria-hidden','true');wrap.prepend(paint);
 input.spellcheck=false;input.wrap='off';input.setAttribute('autocapitalize','off');input.setAttribute('autocomplete','off');
 const update=()=>{paint.innerHTML=colorCode(input.value,document.getElementById('language').value)+'\n';paint.scrollTop=input.scrollTop;paint.scrollLeft=input.scrollLeft};
 input.addEventListener('input',update);input.addEventListener('scroll',update);document.getElementById('language').addEventListener('input',update);update();
}
