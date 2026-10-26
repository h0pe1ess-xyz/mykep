const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const days=['понеділок','вівторок','середа','четвер',"п'ятниця",'субота'];
function cycleFixture(first='60',second='60') {
    const cycle=Object.fromEntries([1,2,3,4].map(week=>[week,Object.fromEntries(days.map(day=>[day,[
        {lesson:1,time:'08:00 - 09:20',subject:`Захист України (1 група) · цикл ${week}`,teacher:'Тест Т.Т.',room:'101',condition:'1-4',starts_on:null,subgroup:{context:'Захист України|група',value:'1',label:'1 група'}},
        {lesson:1,time:'08:00 - 09:20',subject:`Захист України (2 група) · цикл ${week}`,teacher:'Приклад П.П.',room:'102',condition:'1-4',starts_on:null,subgroup:{context:'Захист України|група',value:'2',label:'2 група'}},
        {lesson:2,time:'09:30 - 10:50',subject:`Математика · цикл ${week}`,teacher:'Тест Т.Т.',room:'201',condition:'1-4',starts_on:null,subgroup:null},
        {lesson:8,time:'17:40 - 18:40',subject:'Датоване заняття',teacher:'Тест Т.Т.',room:'202',condition:'1-4 (з 01.10.2026)',starts_on:'2026-10-01',subgroup:null}
    ]]))]));
    const bells=JSON.parse(fs.readFileSync(path.resolve('static/data/bells.json'),'utf8'));
    for(const week of Object.values(cycle)) for(const lessons of Object.values(week)) for(const lesson of lessons) {
        lesson.time=bells[lesson.lesson<=4?first:second][lesson.lesson-1].join(' - ');
    }
    return cycle;
}
async function startFixtureServer({root=path.resolve('static'),port=0,transformCycle=cycle=>cycle,fixtureTag='"fixture"'}={}) {
    const events=[],requests=[];
    const groups=['ПІ-24-02','ЕК(11)-24-03',...Array.from({length:60},(_,i)=>`ТЕСТ-24-${String(i).padStart(2,'0')}`)];
    let buildSuffix='',breakAsset=false,edgeHTML=false;
    const server=http.createServer((req,res)=>{
        const url=new URL(req.url,'http://localhost');
        if (url.pathname.startsWith('/api/')) {
            requests.push(url.pathname);
            res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
            if (url.pathname==='/api/activity' && req.method==='POST') {
                let body='';req.on('data',chunk=>body+=chunk);
                req.on('end',()=>{events.push(JSON.parse(body).event);res.statusCode=204;res.end();});
                return;
            }
            if (url.pathname==='/api/groups') return res.end(JSON.stringify({status:'success',data:groups}));
            if (url.pathname==='/api/teacher-hints') return res.end(fs.readFileSync(path.join(root,'data/teacher-hints.json')));
            if (url.pathname==='/api/schedule') {
                events.push(url.searchParams.get('event'));
                const etag=fixtureTag;res.setHeader('ETag',etag);
                res.setHeader('X-Source-Checked-At','2026-10-14T10:00:00+03:00');res.setHeader('X-Source-Stale','false');
                if (req.headers['if-none-match']===etag) {res.statusCode=304;return res.end();}
                const requested=transformCycle(cycleFixture(url.searchParams.get('duration1')||'60',url.searchParams.get('duration2')||'60'));
                return res.end(JSON.stringify({status:'success',cycle:requested,data:requested[3],meta:{updated_at:'2026-10-14T10:00:00+03:00',stale:false}}));
            }
            res.statusCode=404;return res.end('{}');
        }
        const relative=['/','/schedule.html','/settings.html'].includes(url.pathname)?'index.html':decodeURIComponent(url.pathname).slice(1);
        const file=path.resolve(root,relative);
        const allowed=path.resolve(root);
        if (!file.startsWith(allowed+path.sep)) {res.statusCode=403;return res.end();}
        if (breakAsset && relative==='js/settings.js') {res.statusCode=503;return res.end();}
        try {
            let body=fs.readFileSync(file);
            if (relative==='index.html' && edgeHTML) body=Buffer.from(body.toString().replace('</head>','<!-- Edge-added analytics markup -->\n</head>'));
            if (relative==='sw.js' && buildSuffix) body=Buffer.from(body.toString().replace(/mykep-cache-v[^']+/,`mykep-cache-v${buildSuffix}`));
            const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webp':'image/webp','.png':'image/png','.ico':'image/x-icon'};
            res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
            res.setHeader('Cache-Control','no-cache');res.end(body);
        } catch {res.statusCode=404;res.end();}
    });
    await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
    return {url:`http://127.0.0.1:${server.address().port}`,events,requests,server,
        setBuild:s=>buildSuffix=s,breakAsset:s=>breakAsset=s,edgeHTML:s=>edgeHTML=s,close:()=>new Promise(resolve=>server.close(resolve))};
}
module.exports={startFixtureServer,cycleFixture};
if (require.main===module) startFixtureServer({port:8765}).then(s=>console.log(s.url));
