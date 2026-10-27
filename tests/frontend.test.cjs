const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
test('second shift follows first shift while keeping its own lesson duration',()=>{
    const {run}=fixture();
    const data=JSON.stringify(JSON.parse(fs.readFileSync('static/data/bells.json','utf8')));
    for(const [first,second,fifth,last] of [
        ['60','60','12:50 - 13:50','16:20 - 17:20'],
        ['80','60','14:10 - 15:10','17:40 - 18:40'],
        ['60','80','12:50 - 14:10','17:20 - 18:40'],
        ['80','80','14:10 - 15:30','18:40 - 20:00']
    ]) {
        const times=JSON.parse(run(`JSON.stringify(buildBellTimes(${data},'${first}','${second}'))`));
        assert.equal(times[4].join(' - '),fifth);
        assert.equal(times[7].join(' - '),last);
    }
});
function fixture(initialData={}) {
    const data = new Map(Object.entries(initialData));
    const context = vm.createContext({console,Date,Intl,URLSearchParams,AbortController,setTimeout,clearTimeout,setInterval:()=>0,
        localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},
        document:{getElementById:()=>({}),addEventListener(){},visibilityState:'visible'},window:{addEventListener(){},matchMedia:()=>({matches:true})},
        navigator:{}, isPWA:()=>false, Tabs:{current:'dashboard'}, fetch:async()=>{throw new Error('offline');}});
    for (const file of ['calendar-config','utils','api','dashboard','schedule-share']) vm.runInContext(fs.readFileSync(`static/js/${file}.js`,'utf8'),context);
    const run = code => vm.runInContext(code,context);
    run(`getKyivNow=()=>new Date(2026,9,17,15,0); storage.set('mykep_duration1','80'); storage.set('mykep_duration2','60');`);
    run(`const sampleLesson={lesson:8,time:'17:40 - 18:40',subject:'Тест',teacher:'Тест Т.Т.',room:'101',condition:'1-4',starts_on:null,subgroup:null};
        const cycle=Object.fromEntries([1,2,3,4].map(w=>[w,Object.fromEntries(SCHEDULE_DAYS.map(d=>[d,[]]))]));
        cycle[3]['субота']=[sampleLesson]; cycle[4]['понеділок']=[{...sampleLesson,lesson:1,time:'08:00 - 09:20'}];
        const entry={key:'ПІ-24-02|80|60',cycle,savedAt:1,meta:{updated_at:'2026-10-14T10:00:00+03:00',stale:false}};`);
    return {data,run,context};
}

test('server calendar configuration is validated, cached and used offline',()=>{
    const {run,data}=fixture();
    assert.equal(run(`cycleWeek(new Date(2026,9,26))`),1);
    run(`acceptCalendarConfig({cycle_start:'2026-09-07',cycle_weeks:4})`);
    assert.equal(run(`cycleWeek(new Date(2026,9,26))`),4);
    assert.equal(JSON.parse(data.get('mykep_calendar')).cycle_start,'2026-09-07');
    for(const value of [{cycle_start:'2026-09-08',cycle_weeks:4},{cycle_start:'2026-02-30',cycle_weeks:4},{cycle_start:'9999-12-27',cycle_weeks:4},{cycle_start:'2026-09-07',cycle_weeks:5}]) {
        run(`acceptCalendarConfig(${JSON.stringify(value)})`);
        assert.equal(run(`cycleWeek(new Date(2026,9,26))`),4);
    }
    const second=fixture({mykep_calendar:data.get('mykep_calendar')});
    assert.equal(second.run(`cycleWeek(new Date(2026,9,26))`),4);
});

test('corrupt cycles cannot hide behind valid data or erase other cached groups',async()=>{
    const {run,data}=fixture();
    data.set('mykep_uid','keep-uid');
    data.set('mykep_group','ПІ-24-02');
    run(`storage.set('mykep_schedule',JSON.stringify({version:3,entries:[
        {...entry,cycle:{1:null},data:Object.fromEntries(SCHEDULE_DAYS.map(day=>[day,[]]))},
        {...entry,key:'ІНША|80|60'},
        {...entry,key:'ЗІПСОВАНА|80|60',cycle:{...cycle,1:{...cycle[1],'понеділок':[null]}}}
    ]}))`);
    assert.equal(run(`getCachedSchedule('auto','ПІ-24-02')`),null);
    assert.equal(run(`cachedScheduleForKey('ІНША|80|60').key`),'ІНША|80|60');
    assert.equal(JSON.parse(data.get('mykep_schedule')).entries.length,1);
    assert.equal(data.get('mykep_uid'),'keep-uid');
    assert.equal(data.get('mykep_group'),'ПІ-24-02');
    assert.equal(data.get('mykep_duration1'),'80');
    run(`fetch=async()=>({ok:true,status:200,headers:{get:()=>null},json:async()=>({status:'success',cycle,meta:{}})})`);
    const result=await run(`fetchSchedule('current','ПІ-24-02')`);
    assert.ok(result.data);
    assert.equal(run(`cachedScheduleForKey('ІНША|80|60').key`),'ІНША|80|60');
});

test('schedule response supplies calendar configuration for subsequent offline views',async()=>{
    const {run,data}=fixture();
    run(`fetch=async()=>({ok:true,status:200,headers:{get:()=>null},json:async()=>({status:'success',cycle,meta:{},calendar:{config:{cycle_start:'2026-09-07',cycle_weeks:4}}})})`);
    const online=await run(`fetchSchedule('next','ПІ-24-02')`);
    assert.equal(online.calendar.cycle,3);
    assert.equal(JSON.parse(data.get('mykep_calendar')).cycle_start,'2026-09-07');
    run(`fetch=async()=>{throw new Error('offline')}`);
    const offline=await run(`fetchSchedule('next','ПІ-24-02')`);
    assert.equal(offline.calendar.cycle,3);
});

test('next calendar week has dates and filters future-start lessons',()=>{
    const {run}=fixture();
    run(`cycle[4]['понеділок']=[{...sampleLesson,starts_on:'2026-10-26'}]`);
    assert.equal(run(`materializeSchedule(entry,'next','ПІ-24-02',new Date(2026,9,14)).calendar.monday`),'2026-10-19');
    assert.equal(run(`materializeSchedule(entry,'next','ПІ-24-02',new Date(2026,9,14)).data['понеділок'].length`),0);
    assert.equal(run(`materializeSchedule(entry,'4','ПІ-24-02',new Date(2026,9,14)).data['понеділок'].length`),1);
});
test('calendar week waits for actual Saturday end, Sunday advances, Monday resets',()=>{
    const {run}=fixture();
    assert.equal(run(`dateKey(defaultMonday(entry,'ПІ-24-02'))`),'2026-10-12');
    assert.equal(run(`dateKey(defaultMonday(entry,'ПІ-24-02',new Date(2026,9,17,18,40)))`),'2026-10-19');
    assert.equal(run(`dateKey(defaultMonday(entry,'ПІ-24-02',new Date(2026,9,18)))`),'2026-10-19');
    assert.equal(run(`dateKey(defaultMonday(entry,'ПІ-24-02',new Date(2026,9,19)))`),'2026-10-19');
    assert.equal(run(`materializeSchedule(entry,'current','ПІ-24-02',new Date(2026,9,18)).calendar.monday`),'2026-10-12');
});
test('cycle rollover and next teaching day cross Sunday and 4 to 1',()=>{
    const {run}=fixture();
    assert.equal(run(`materializeSchedule(entry,'auto','ПІ-24-02').nextDay.date`),'2026-10-19');
    assert.equal(run(`cycleWeek(new Date(2026,9,25))`),4);
    assert.equal(run(`cycleWeek(new Date(2026,9,26))`),1);
    assert.equal(run(`materializeSchedule(entry,'auto','ПІ-24-02',new Date(2026,9,17,23,59)).today.length`),1);
    assert.equal(run(`materializeSchedule(entry,'auto','ПІ-24-02',new Date(2026,9,18,0,0)).today.length`),0);
});
test('offline cycle never activates before start date and manual mode has no invented date',()=>{
    const {run}=fixture();
    run(`cycle[3]['середа']=[{...sampleLesson,starts_on:'2026-10-01',condition:'1,3 (з 01.10.2026)'}];`);
    assert.equal(run(`materializeSchedule(entry,'current','ПІ-24-02',new Date(2026,8,16)).data['середа'].length`),0);
    assert.equal(run(`materializeSchedule(entry,'current','ПІ-24-02',new Date(2026,9,14)).data['середа'].length`),1);
    assert.equal(run(`materializeSchedule(entry,'3','ПІ-24-02').calendar.monday`),null);
    assert.equal(run(`scheduleExportDayLabel('середа','current',new Date(2026,9,12))`),'Середа · 14 жовтня 2026');
    assert.equal(run(`scheduleExportDayLabel('середа','3',new Date(2026,9,12))`),'Середа · 3-й тиждень');
});
test('next classes separate the date and time without sentence clutter',()=>{
    const {run}=fixture();
    assert.equal(run(`tomorrowLessonMessage({date:'2026-10-26',lessons:[
        {...sampleLesson,time:'15:20 - 16:20'}, {...sampleLesson,time:'14:10 - 15:10'}
    ]})`),'Понеділок, 26 жовтня\n14:10–16:20');
    assert.equal(run(`tomorrowLessonMessage(null)`),'Поки немає запланованих пар');
});

test('source check labels preserve Kyiv time and distinguish missing or old dates',()=>{
    const {run}=fixture();
    assert.equal(run(`sourceTimeLabel({updated_at:'2026-10-24T18:31:00Z'})`),'Перевірено 24 жовтня о 21:31');
    assert.match(run(`sourceTimeLabel({updated_at:'2025-12-31T12:00:00Z'})`),/31 грудня 2025/);
    assert.equal(run(`sourceTimeLabel({updated_at:'invalid'})`),'Час перевірки невідомий');
    assert.equal(run(`sourceTimeLabel({})`),'Час перевірки невідомий');
});

test('simultaneous lessons form one interval with a strictly later next slot',()=>{
    const {run}=fixture();
    assert.equal(run(`lessonIntervals([{...sampleLesson,subject:'Група 1'},{...sampleLesson,subject:'Група 2'}]).length`),1);
    assert.equal(run(`lessonIntervals([{...sampleLesson,subject:'Група 1'},{...sampleLesson,subject:'Група 2'}])[0].subject`),'Група 1 / Група 2');
});
test('all explicit subgroup variants and common classes remain visible without a selection UI',()=>{
    const {run,data}=fixture();
    data.set('mykep_subgroups',JSON.stringify({'ПІ-24-02':{'Хімія|група':'1'}}));
    assert.equal(run(`filterLessons([sampleLesson,{...sampleLesson,subgroup:{context:'Хімія|група',value:'1'}},{...sampleLesson,subgroup:{context:'Хімія|група',value:'2'}},{...sampleLesson,subgroup:{context:'Захист України|група',value:'2'}}],new Date(2026,9,14),'ПІ-24-02').length`),4);
});
test('cache migration preserves UID, onboarding, durations, group and all legacy views',()=>{
    const {run,data}=fixture();
    for (const [key,value] of Object.entries({mykep_uid:'synthetic-id',mykep_onboarded:'true',mykep_group:'ПІ-24-02',mykep_duration1:'60'})) data.set(key,value);
    run(`storage.set('mykep_schedule',JSON.stringify({version:2,entries:[{key:'ПІ-24-02|80|60|2026-10-12|3',data:cycle[3],savedAt:1}]}));`);
    assert.equal(run(`readScheduleEntries().length`),1);
    assert.equal(JSON.parse(data.get('mykep_schedule')).version,3);
    assert.equal(data.get('mykep_uid'),'synthetic-id');
    assert.equal(data.get('mykep_onboarded'),'true');
    assert.equal(data.get('mykep_group'),'ПІ-24-02');
    assert.equal(data.get('mykep_duration1'),'60');
});
test('bounded eviction protects main group, retains other groups and uses all offline weeks',async()=>{
    const {run}=fixture();
    run(`saveScheduleEntry(entry); for (let i=0;i<20;i++) saveScheduleEntry({...entry,key:'other'+i+'|80|60',usedAt:i+1});`);
    assert.equal(run(`readScheduleEntries().length`),12);
    assert.equal(run(`Boolean(cachedScheduleForKey(entry.key))`),true);
    assert.equal(run(`Boolean(cachedScheduleForKey('other0|80|60'))`),false);
    const offline=await run(`fetchSchedule('4','ПІ-24-02')`);
    assert.equal(offline.calendar.cycle,4);
    assert.equal(offline.data['понеділок'].length,1);
    assert.equal(offline.meta.updated_at,'2026-10-14T10:00:00+03:00');
    assert.equal(offline.meta.stale,true);
});

test('cache validates once, reuses views, and invalidates after replacement or removal',()=>{
    const {run,data}=fixture();
    run(`storage.set('mykep_schedule',JSON.stringify({version:3,entries:[entry]}));
        let validations=0; const validate=validCycle; validCycle=(...args)=>{validations++;return validate(...args);};
        const first=getCachedSchedule('auto');
        for(let i=0;i<20;i++) {readScheduleEntries();getCachedSchedule('auto');}`);
    assert.equal(run('validations'),1);
    assert.equal(run(`first.data === getCachedSchedule('auto').data`),true);
    run(`storage.remove('mykep_schedule');`);
    assert.equal(run(`readScheduleEntries().length`),0);
    data.set('mykep_schedule','broken');
    assert.equal(run(`readScheduleEntries().length`),0);
    run(`storage.set('mykep_schedule',JSON.stringify({version:3,entries:[entry]}));`);
    assert.equal(run(`readScheduleEntries().length`),1);
    assert.equal(run('validations'),2);
});

test('unchanged 304 checks coalesce across weeks and event kinds without persistent writes',async()=>{
    const {run}=fixture();
    run(`saveScheduleEntry(entry); let requests=0,writes=0,release;
        const save=storage.set;storage.set=(key,value)=>{if(key==='mykep_schedule')writes++;return save(key,value);};
        const gate=new Promise(resolve=>release=resolve);
        fetch=async url=>{if(url==='/api/activity')return {ok:true};requests++;await gate;return {status:304,headers:{get:key=>key==='X-Source-Checked-At'?entry.meta.updated_at:'false'}};};`);
    const first=run(`fetchSchedule('auto',null,'view')`);
    const second=run(`fetchSchedule('4',null,'interaction')`);
    run('release()');
    const [auto,manual]=await Promise.all([first,second]);
    assert.equal(run('requests'),1);
    assert.equal(run('writes'),0);
    assert.equal(manual.calendar.cycle,4);
    assert.equal(auto.calendar.monday,'2026-10-12');
    await run(`fetchSchedule('current')`);
    assert.equal(run('writes'),0);
    run(`fetch=async()=>({status:304,headers:{get:key=>key==='X-Source-Checked-At'?'2026-10-14T11:00:00+03:00':'false'}});`);
    await run(`fetchSchedule()`);
    assert.equal(run('writes'),1);
    assert.equal(run(`getCachedSchedule().data===getCachedSchedule().data`),true);
});

test('failed coalesced requests use each exact legacy week and never invent missing cycles',async()=>{
    const {run}=fixture();
    run(`storage.set('mykep_schedule',JSON.stringify({version:2,entries:[
        {key:'ПІ-24-02|80|60|2026-10-12|3',data:cycle[3]},
        {key:'ПІ-24-02|80|60|2026-10-12|4',data:cycle[4]}]}));`);
    const [third,fourth,first]=await Promise.all([run(`fetchSchedule('3')`),run(`fetchSchedule('4')`),run(`fetchSchedule('1')`)]);
    assert.equal(third.data['понеділок'].length,0);
    assert.equal(fourth.data['понеділок'].length,1);
    assert.equal(first.data,null);
});

test('room cues retain all parallel rooms and escape room text',()=>{
    const {run}=fixture();
    const rooms=run("renderRoomCue('101 / 102')");
    assert.match(rooms,/Аудиторії/);
    assert.match(rooms,/>101<.*>102</);
    assert.match(run("renderRoomCue('101/3')"),/>101\/3</);
    assert.match(run("renderRoomCue('<b>101</b>')"),/&lt;b&gt;101&lt;\/b&gt;/);
    assert.match(run("renderRoomCue('')"),/Не вказано/);
});

test('room cues shorten gym names and reduce long labels without changing numeric rooms',()=>{
    const {run}=fixture();
    for (const room of ['спортивний зал','Спортзал','спорт. зал']) {
        const html=run(`renderRoomCue(${JSON.stringify(room)})`);
        assert.match(html,/class="room-cue-number is-text"/);
        assert.match(html,/>спорт\. зал</);
    }
    assert.match(run("renderRoomCue('навчально-виробнича майстерня')"),/class="room-cue-number is-long"/);
    assert.match(run("renderRoomCue('313')"),/class="room-cue-number"/);
});
