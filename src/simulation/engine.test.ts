import {destinations,library} from '../data/mock';import {simulate} from './engine';
function assert(value:boolean,message:string){if(!value)throw new Error(message)}
const d=destinations[0],get=(id:string)=>({...library.find(i=>i.id===id)!});
const festival=get('festival'),shuttle=get('shuttle');
const baseline=simulate(d,9,'Clear skies',[]);const blocked=simulate(d,9,'Clear skies',[festival]);
assert(blocked.bottleneck,'Festival must require evening transport');
assert(simulate(d,9,'Clear skies',[festival,shuttle]).bottleneck,'20:30 shuttle must be too early');
shuttle.hours=23;const resolved=simulate(d,9,'Clear skies',[festival,shuttle]);assert(!resolved.bottleneck,'Late shuttle must resolve dependency');assert(resolved.visitors>blocked.visitors,'Transport should unlock demand');
assert(JSON.stringify(resolved)===JSON.stringify(simulate(d,9,'Clear skies',[festival,shuttle])),'Identical inputs must reproduce outputs');
assert(simulate(d,9,'Heavy rain',[]).visitors<baseline.visitors,'Rain reduces baseline demand');
assert(simulate(d,1,'Clear skies',[]).visitors>baseline.visitors,'Winter seasonal baseline should increase');
const huge={...get('marketing'),amount:200,duration:7};const constrained=simulate(d,1,'Clear skies',[huge]);assert(constrained.constrained,'Excess demand should hit capacity');assert(constrained.occupancy<=100,'Occupancy may not exceed capacity');assert(simulate(d,1,'Clear skies',[huge,get('hotel')]).visitors>constrained.visitors,'Additional hotel beds unlock constrained demand');
assert(simulate(d,9,'Clear skies',[{...festival,enabled:false}]).visitors===baseline.visitors,'Disabled interventions must have no effect');assert(resolved.benefit===Math.round((resolved.spending-resolved.baseSpending)*.64-resolved.cost),'Economic benefit must reconcile');
festival.hours=24;assert(simulate(d,9,'Clear skies',[festival,shuttle]).bottleneck,'Event finish configuration must affect dependency');console.log('Passed: reproducibility, transport timing, capacity, weather, seasonality, activation, economics.');
