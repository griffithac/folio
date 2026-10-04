import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import { prepareRequest, normalizeClassification } from '../lib/classification.ts';
import { resolveLanguageConflict } from '../lib/language-classification.ts';
import { LANGUAGE_CATALOG, LANGUAGE_METHOD } from '../lib/language-catalog.ts';
import { TAXONOMY_VERSION } from '../lib/standards.ts';

// Original development passages, not an independently adjudicated book corpus.
const fixtures = [
  { name:'English prose with code and a French quotation', expected:'eng', text:'The farmer opened the old wooden gate and walked toward the river. The children waited beside the bridge while their mother gathered apples from the garden. They planned to share the fruit with their neighbors after supper. A visitor said “Bonjour, mes amis” and then continued speaking English. A sign contained the words Python, JavaScript and SQL; it was merely part of the scenery.' },
  { name:'Welsh narrative', expected:'cym', text:'Roedd y plant yn cerdded drwy’r goedwig gyda’u mam. Ar ddiwedd y llwybr roedd tŷ bach ger yr afon. Agorodd yr hen ddyn y drws a gofyn iddynt ddod i mewn. Roedd bara a llaeth ar y bwrdd, ac roedd y tân yn cynhesu’r ystafell. Ar ôl bwyta, eisteddodd y teulu gyda’i gilydd a gwrando ar stori am y pentref a’r bobl oedd yn byw yno.' },
  { name:'Basque narrative', expected:'eus', text:'Goizean, haurrek etxeko atea ireki zuten eta ibairantz abiatu ziren. Amak ogia eta ura prestatu zituen bidaiarako. Herriko zubian aitona zegoen, eguzkiaren argia begira. Denak batera basora joan ziren, eta zuhaitzen artean txoriak entzun zituzten. Arratsaldean etxera itzuli ziren, nekatuta baina pozik, eta egun hartako istorioak kontatu zituzten mahai inguruan.' },
  { name:'Icelandic narrative', expected:'isl', text:'Börnin gengu niður að ánni með móður sinni. Gamla húsið stóð við brúna og gluggarnir voru opnir. Inni sat afi við borðið og las bók. Hann bauð þeim að koma inn og fá brauð og mjólk. Eftir matinn sagði hann þeim sögu um fólkið í þorpinu og ferðina yfir fjöllin. Þegar kvöldið kom fóru þau heim og horfðu á stjörnurnar fyrir ofan fjörðinn.' },
  { name:'Afrikaans narrative', expected:'afr', text:'Die kinders het vroeg in die oggend wakker geword en saam met hulle ma na die rivier gestap. By die ou brug het hulle oupa gewag met ’n mandjie vol brood en appels. Hulle het onder ’n groot boom gaan sit en na die voëls geluister. Later het oupa ’n storie vertel oor die mense van die dorp en die lang reis oor die berge.' },
  { name:'Esperanto narrative', expected:'epo', text:'La infanoj iris al la rivero kun sia patrino. Apud la malnova ponto staris malgranda domo kun malfermitaj fenestroj. La avo sidis ĉe la tablo kaj legis libron. Li invitis ilin eniri kaj manĝi panon kaj fruktojn. Post la manĝo li rakontis historion pri la vilaĝo kaj la homoj, kiuj loĝis tie. Vespere la familio revenis hejmen.' },
  { name:'Haitian Creole narrative', expected:'hat', text:'Timoun yo leve bonè nan maten epi yo ale bò larivyè a ak manman yo. Toupre ansyen pon an, granpapa yo te chita anba yon gwo pyebwa. Li te pote pen ak fwi pou tout fanmi an. Yo te manje ansanm epi yo te koute yon istwa sou moun ki te rete nan vilaj la. Lè solèy la te kouche, yo te retounen lakay yo ak kè kontan.' },
  { name:'Latin narrative', expected:'lat', text:'Pueri cum matre ad flumen ambulabant. Prope pontem vetus domus erat, et senex in horto sedebat. Senex pueros vocavit et eis panem et aquam dedit. Post cibum fabulam de oppido et civibus narravit. Mater verba eius attente audiebat, dum pueri sub arbore ludebant. Vespere omnes domum redierunt et de itinere suo cum amicis locuti sunt.' },
  { name:'Scottish Gaelic narrative', expected:'gla', text:'Bha a’ chlann a’ coiseachd dhan abhainn còmhla ri am màthair. Bha taigh beag faisg air an drochaid agus bha an doras fosgailte. Bha am bodach na shuidhe aig a’ bhòrd agus leabhar na làimh. Thug e aran agus bainne dhan chloinn. An dèidh biadh dh’innis e sgeulachd mun bhaile agus na daoine a bha a’ fuireach ann. Air an fheasgar chaidh iad dhachaigh.' },
  { name:'Norwegian Nynorsk narrative', expected:'nno', text:'Borna gjekk ned til elva saman med mora si. Ved den gamle brua stod eit lite hus med opne vindauge. Bestefaren sat ved bordet og las ei bok. Han bad dei kome inn og gav dei brød og mjølk. Etter maten fortalde han ei historie om bygda og menneska som budde der. Då kvelden kom, gjekk dei heim og snakka om det dei hadde høyrt.' },
  { name:'Arabic narrative', expected:'ara', text:'خرج الأطفال مع أمهم في الصباح وساروا إلى النهر. كان جدهم ينتظر عند الجسر القديم ويحمل سلة فيها خبز وتفاح. جلسوا تحت شجرة كبيرة واستمعوا إلى أصوات الطيور. بعد الطعام حكى الجد قصة عن أهل القرية ورحلتهم عبر الجبال. وعندما حل المساء عاد الجميع إلى البيت وتحدثوا عن الأشياء الجميلة التي رأوها في ذلك اليوم.' },
  { name:'Chinese narrative', expected:'zho', text:'清晨，孩子们跟着母亲走出家门，沿着小路来到河边。祖父已经在旧桥旁等候，手里提着装满面包和苹果的篮子。他们一起坐在大树下面，听鸟儿唱歌，看阳光在水面上闪动。吃过午饭，祖父讲起村庄里的人们和他年轻时翻越山岭的故事。孩子们认真地听着，不时提出问题。傍晚，他们沿着来时的路回家，把今天看到的景色讲给父亲听。第二天，他们又来到河边，帮助邻居整理菜园，给新种下的树苗浇水。大家一起劳动，也一起分享收获。' },
  { name:'Japanese narrative', expected:'jpn', text:'朝になると、子どもたちは母親と一緒に川へ向かいました。古い橋のそばには小さな家があり、祖父が窓を開けて待っていました。みんなでパンと果物を食べたあと、祖父は村の人々と山を越えた旅の話をしました。子どもたちは静かに話を聞き、ときどき質問しました。夕方には家へ帰り、その日に見た景色を父親に伝えました。次の日も川へ行き、近所の人と一緒に庭の木に水をあげました。村のみんなで働き、収穫した野菜を分け合いました。' },
  { name:'Equal English and Spanish parallel prose', expected:'mul', text:'The children walked toward the river with their mother. They crossed the old bridge and visited their grandfather. He gave them bread and apples and told a story about the village. At sunset the family returned home.\nLos niños caminaron hacia el río con su madre. Cruzaron el viejo puente y visitaron a su abuelo. Él les dio pan y manzanas y contó una historia sobre el pueblo. Al atardecer la familia regresó a casa.' },
  { name:'Code only with no natural prose', expected:'zxx', text:Array.from({length:16},(_,i)=>`const x${i} = (${i} * 3) + 2;\nconst f${i} = (a, b) => a + b + x${i};\nf${i}(4, 7);`).join('\n') },
];
const envText = await readFile('.dev.vars','utf8').catch(()=> '');
const key=process.env.TYPESAFE_API_KEY || envText.match(/^TYPESAFE_API_KEY\s*=\s*["']?([^"'\r\n]+)/m)?.[1];
if(!key)throw Error('A server-side TypeSafe key is required.');
const model=process.env.TYPESAFE_MODEL || 'jev-1.13.0';
const client=new TypeSafeClient({apiKey:key,defaultModel:model,logLevel:'off',timeout:30000,retry:{maxRetries:0}});
await mkdir('outputs',{recursive:true});
const report:any={runAt:new Date().toISOString(),model,method:LANGUAGE_METHOD,catalog:LANGUAGE_CATALOG,taxonomyVersion:TAXONOMY_VERSION,questionCount:72,notes:'Original developer language passages. Expected labels are author-supplied, not independently reviewed. These regressions check workflow behavior, not accuracy on books or the entire ISO catalog.',cases:[]};
for(const fixture of fixtures){
  const text=fixture.text.length<200?fixture.text+'\n'+fixture.text:fixture.text;
  const payload=prepareRequest({title:'Language development fixture',pageCount:1,samples:[{page:1,text}]});
  const started=Date.now();const raw=await client.systemOne(payload);const responses: {usage:typeof raw.usage;model:string;answers:unknown}[]=[raw];
  const result=await resolveLanguageConflict(normalizeClassification(raw),payload.state,async request=>{const response=await client.systemOne(request);responses.push(response);return response;});
  const record={...fixture,text,predicted:result.language.iso639_2,matched:fixture.expected===result.language.iso639_2,milliseconds:Date.now()-started,language:result.language,languageAnalysis:result.languageAnalysis,usage:responses.map(response=>response.usage)};
  report.cases.push(record);
  await writeFile('outputs/language-regressions.json',JSON.stringify(report,null,2));
  await writeFile('outputs/language-last-response.json',JSON.stringify({payload,responses,result},null,2));
  console.log(JSON.stringify({name:fixture.name,expected:fixture.expected,predicted:record.predicted,matched:record.matched,requests:result.languageAnalysis?.requests,status:result.languageAnalysis?.status,groupChoices:result.languageAnalysis?.groups.map(g=>g.choice),confidence:result.language.confidence}));
}
await writeFile('public/language-regressions.json',JSON.stringify(report,null,2)+'\n');
