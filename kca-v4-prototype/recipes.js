/* GodHealth recipe engine: transparent estimates; never claim verified micronutrient totals. */
(function(){
"use strict";
const db={
oats:{k:389,p:16.9,f:6.9,c:66.3},egg:{k:143,p:12.6,f:9.5,c:.7},skyr:{k:63,p:11,f:.2,c:4},apple:{k:52,p:.3,f:.2,c:13.8},berries:{k:50,p:.7,f:.3,c:12},banana:{k:89,p:1.1,f:.3,c:22.8},almonds:{k:579,p:21.2,f:49.9,c:21.6},walnuts:{k:654,p:15.2,f:65.2,c:13.7},olive:{k:884,p:0,f:100,c:0},chicken:{k:165,p:31,f:3.6,c:0},turkey:{k:135,p:29,f:1.6,c:0},salmon:{k:208,p:20,f:13,c:0},cod:{k:82,p:18,f:.7,c:0},tofu:{k:144,p:17,f:8.7,c:2.8},lentils:{k:116,p:9,f:.4,c:20.1},chickpeas:{k:164,p:8.9,f:2.6,c:27.4},rice:{k:130,p:2.7,f:.3,c:28.2},potato:{k:87,p:1.9,f:.1,c:20.1},sweetpotato:{k:86,p:1.6,f:.1,c:20.1},broccoli:{k:34,p:2.8,f:.4,c:6.6},spinach:{k:23,p:2.9,f:.4,c:3.6},carrot:{k:41,p:.9,f:.2,c:9.6},cucumber:{k:15,p:.7,f:.1,c:3.6},tomato:{k:18,p:.9,f:.2,c:3.9},orange:{k:47,p:.9,f:.1,c:11.8},milk:{k:61,p:3.2,f:3.3,c:4.8}};
const labels={oats:"Rolled oats",egg:"Eggs",skyr:"Plain skyr",apple:"Apple",berries:"Mixed berries",banana:"Banana",almonds:"Almonds",walnuts:"Walnuts",olive:"Extra virgin olive oil",chicken:"Chicken breast (cooked)",turkey:"Turkey breast (cooked)",salmon:"Salmon (cooked)",cod:"Cod (cooked)",tofu:"Firm tofu",lentils:"Lentils (cooked)",chickpeas:"Chickpeas (cooked)",rice:"Rice (cooked)",potato:"Potato (cooked)",sweetpotato:"Sweet potato (cooked)",broccoli:"Broccoli",spinach:"Spinach",carrot:"Carrot",cucumber:"Cucumber",tomato:"Tomato",orange:"Orange",milk:"Pasteurized whole milk"};
const recipes=[
["Apple Cinnamon Protein Oats","breakfast","vegetarian",[["oats",65],["skyr",220],["apple",160],["walnuts",15]],"Cook oats in water; fold in skyr after cooling slightly; top with diced apple, walnuts and cinnamon."],
["Berry Almond Breakfast Bowl","breakfast","vegetarian",[["skyr",300],["berries",160],["oats",50],["almonds",20]],"Spoon skyr into a bowl; add berries, oats and chopped almonds."],
["Egg and Sweet Potato Breakfast","breakfast","vegetarian",[["egg",150],["sweetpotato",200],["spinach",100],["olive",10],["orange",150]],"Roast cubed sweet potato until tender; scramble eggs with spinach; serve with orange."],
["Chicken Garden Rice Plate","main","clean-meat",[["chicken",150],["rice",200],["broccoli",180],["carrot",120],["olive",18],["apple",150]],"Cook rice; steam vegetables; cook chicken thoroughly; finish with olive oil and apple."],
["Turkey Harvest Bowl","main","clean-meat",[["turkey",160],["sweetpotato",220],["spinach",120],["tomato",150],["olive",18],["orange",150]],"Roast sweet potato; cook turkey thoroughly; toss vegetables with olive oil; serve fruit."],
["Salmon and Potato Garden Plate","main","fish",[["salmon",160],["potato",250],["broccoli",200],["olive",12],["berries",150]],"Bake salmon until safely cooked; boil potatoes and steam broccoli; serve berries."],
["Cod and Herbed Rice","main","fish",[["cod",190],["rice",220],["spinach",150],["tomato",150],["olive",22],["apple",150]],"Bake cod; prepare rice; wilt spinach and tomato in olive oil; serve apple."],
["Lentil Sweet Potato Bowl","main","vegan",[["lentils",260],["sweetpotato",220],["broccoli",160],["olive",18],["orange",160]],"Roast sweet potato; warm cooked lentils; steam broccoli; drizzle olive oil and serve orange."],
["Chickpea Garden Bowl","main","vegan",[["chickpeas",230],["rice",140],["cucumber",180],["tomato",150],["olive",18],["berries",150]],"Cook rice; combine chickpeas with diced vegetables and olive oil; serve berries."],
["Tofu Vegetable Rice Bowl","main","vegan",[["tofu",230],["rice",210],["broccoli",170],["carrot",120],["olive",16],["apple",150]],"Sear tofu until heated through; steam vegetables and prepare rice; serve with apple."]
];
function totals(items){const out={kcal:0,protein:0,fat:0,carbs:0};for(const [id,g] of items){const d=db[id];if(!d)throw Error("Unknown food "+id);out.kcal+=d.k*g/100;out.protein+=d.p*g/100;out.fat+=d.f*g/100;out.carbs+=d.c*g/100}return Object.fromEntries(Object.entries(out).map(([k,v])=>[k,Math.round(v)]))}
const norm=x=>String(x||"").toLowerCase().replace(/[^a-z0-9]+/g," ");
function recipeCandidates(a){
 const favorites=norm([a.NU15,a.NU16].join(" "));const restricted=norm([a.NU11,a.NU17].join(" "));
 const avoid=/(allerg|intoleran|avoid|no |without|dislike|cannot|can t|celiac|coeliac|vegan|vegetarian|dairy free|gluten free|halal|kosher|nut free|low sodium|low potassium|diabet|renal|kidney|pregnan|breastfeed|eating disorder)/.test(restricted);
 if(avoid)return {requiresReview:true,recipes:[],reason:"Food restrictions or allergies require verified ingredient-level filtering and coach approval."};
 let pool=recipes.map(([name,kind,category,ingredients,method])=>({name,kind,category,ingredients,method,score:ingredients.reduce((s,[id])=>s+(favorites.includes(id)||favorites.includes(labels[id].toLowerCase())?2:0),0)}));
 pool.sort((x,y)=>y.score-x.score);
 return {requiresReview:false,recipes:pool};
}
function optimizePortions(items,energy,macros,micronutrientConstraints,foodData){
 const valid=macros&&['protein','fat','carbs'].every(k=>Number.isFinite(macros[k])&&macros[k]>0);
 const base=items.map(([id,g])=>({id,base:g,min:Math.max(5,Math.round(g*.55/5)*5),max:Math.max(5,Math.round(g*2.1/5)*5)}));
 const proposed=base.map(x=>[x.id,x.base]);
 function score(v){const t=totals(v);let s=Math.pow((t.kcal-energy)/Math.max(energy,1),2)*6;
 if(valid)for(const k of ['protein','fat','carbs'])s+=Math.pow((t[k]-macros[k])/Math.max(macros[k],10),2);
 if(micronutrientConstraints&&foodData){for(const [key,min] of Object.entries(micronutrientConstraints)){if(!Number.isFinite(min)||min<=0)continue;let amount=0,complete=true;for(const [id,g] of v){const raw=foodData[id]?.per100g?.[key];if(!Number.isFinite(raw)){complete=false;break}amount+=raw*g/100}if(complete&&amount<min)s+=2*Math.pow((min-amount)/min,2)}}
 for(let i=0;i<v.length;i++)s+=.005*Math.pow((v[i][1]-base[i].base)/Math.max(base[i].base,5),2);
 return s}
 for(let pass=0;pass<5;pass++)for(let i=0;i<base.length;i++){
  let best=proposed[i][1],lowest=Infinity;
  for(let grams=base[i].min;grams<=base[i].max;grams+=5){proposed[i][1]=grams;const s=score(proposed);if(s<lowest){lowest=s;best=grams}}
  proposed[i][1]=best;
 }
 const missingMicronutrients=micronutrientConstraints&&foodData?Object.keys(micronutrientConstraints).filter(key=>proposed.some(([id])=>!Number.isFinite(foodData[id]?.per100g?.[key]))):[];
 return {ingredients:proposed,nutrition:totals(proposed),missingMicronutrients,optimizedAgainst:valid?'explicit_coach_macro_targets':'maintenance_energy_reference_only',micronutrientConstraintsApplied:!!(micronutrientConstraints&&foodData)}
}
function makeWeek(a,energy,coachMacros,coachMicros,foodData){
 const choices=recipeCandidates(a);if(choices.requiresReview||!Number.isFinite(energy)||energy<1200||energy>4500)return {requiresReview:true,reason:choices.reason||"Energy target needs qualified review before portion calculation.",days:[],shopping:[]};
 const mealCount=Math.max(2,Math.min(4,parseInt(a.NU1,10)||3));const slots=mealCount;
 const breakfasts=choices.recipes.filter(r=>r.kind==="breakfast");const mains=choices.recipes.filter(r=>r.kind==="main");const shopping={};
 const days=Array.from({length:7},(_,i)=>{
  const meals=Array.from({length:slots},(_,j)=>{
   const template=j===0?breakfasts[i%breakfasts.length]:mains[(i*2+j-1)%mains.length];
   const target=energy/slots;
   const base=totals(template.ingredients).kcal;
   const selected=optimizePortions(template.ingredients,target,coachMacros&&Object.fromEntries(['protein','fat','carbs'].map(k=>[k,coachMacros[k]/slots])),coachMicros&&Object.fromEntries(Object.entries(coachMicros).map(([k,v])=>[k,v/slots])),foodData);
   const ingredients=selected.ingredients;
   for(const [id,g] of ingredients)shopping[id]=(shopping[id]||0)+g;
   return {name:template.name,category:template.category,ingredients:ingredients.map(([id,g])=>({food:labels[id],grams:g,id})),method:template.method,nutrition:totals(ingredients),micronutrients:null,micronutrientStatus:"See separate USDA nutrient calculation when available; adequacy not established.",optimization:{optimizedAgainst:selected.optimizedAgainst,missingMicronutrients:selected.missingMicronutrients}};
  });
  return {day:["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"][i],meals,totals:totals(meals.flatMap(m=>m.ingredients.map(x=>[x.id,x.grams])))};
 });
 const deviations=days.map(d=>({day:d.day,estimatedKcal:d.totals.kcal,maintenanceReferenceKcal:energy,differenceKcal:d.totals.kcal-energy,differencePct:Math.round(100*(d.totals.kcal-energy)/energy)}));
 return {requiresReview:false,energyReferenceType:"estimated_maintenance_not_a_prescribed_target",deviations,days,shopping:Object.entries(shopping).map(([id,grams])=>({food:labels[id],grams})).sort((a,b)=>a.food.localeCompare(b.food)),disclaimer:"Serving sizes are scaled against an estimated maintenance reference, not a prescribed calorie goal. Macro calculations use the locally loaded USDA mappings when available. Portion rounding and ingredient variants affect totals. Micronutrient adequacy has not been established; coach review is mandatory."};
}
window.GodHealthRecipeEngine={db,recipes,totals,recipeCandidates,optimizePortions,makeWeek};
})();