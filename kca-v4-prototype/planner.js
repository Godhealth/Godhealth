/* GodHealth V4 personalized planning layer — client-side, coach-review required. */
(function(){
"use strict";
const base=window.GodHealthV4;
const safe=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const first=(s,f)=>String(s||"").split(/[,;\n]/).map(x=>x.trim()).filter(Boolean)[0]||f;
const days=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const n=x=>{const v=Number(String(x??"").replace(",","."));return Number.isFinite(v)?v:null};
function plan(a){
 const basePlan=base.generate(a);
 const flags=base.safety(a);
 const restrictions=[a.NU11,a.NU17].filter(Boolean).join("; ");
 const allergies=!!restrictions;
 const risk=flags.length>0;
 const age=n(a.PR1),height=n(a.PR3),weight=n(a.PR4);
 const missingVitals=!(age>=18&&age<=100&&height>=100&&height<=250&&weight>=30&&weight<=400);
 const equation=a.PR2==="Male"?5:a.PR2==="Female"?-161:null;
 const bmr=missingVitals||equation===null?null:Math.round(10*weight+6.25*height-5*age+equation);
 const multiplier={"Mostly sitting":1.2,"Mostly standing":1.35,"Mostly walking":1.5,"Physically demanding":1.65}[a.PR7]||null;
 const maintenance=bmr&&multiplier?Math.round(bmr*multiplier/50)*50:null;
 const goal=a.GL1||"Whole-person transformation";
 const objectives=goal==="Fat loss"?["Practice consistent, satisfying meals without crash dieting","Increase comfortable daily movement","Monitor energy, strength and sustainable progress"]:goal==="Muscle and strength"?["Complete consistent strength sessions","Include a protein source in meals","Progress repetitions or difficulty gradually"]:goal==="More energy"?["Prioritize regular sleep opportunities","Build a sustainable movement routine","Review meal timing and recovery"]:["Build steady daily habits","Strengthen Body, Soul & Spirit routines","Track progress and adapt without perfectionism"];
 const sessions=Math.min(4,Math.max(1,parseInt(a.TR4,10)||2));
 const novice=["New to training","Under 6 months"].includes(a.TR3);
 const gym=["Gym","Both"].includes(a.TR6);
 const workouts=Array.from({length:sessions},(_,i)=>{
   const movements=gym?[
    ["Leg press or squat variation","Seated row","Chest press","Calf raise","Dead bug"],
    ["Supported split squat","Lat pulldown","Dumbbell shoulder press","Hip hinge","Side plank"],
    ["Goblet squat","Cable row","Incline press","Glute bridge","Bird dog"],
    ["Step-up","Lat pulldown","Chest press","Hamstring curl","Dead bug"]
   ]:[
    ["Sit-to-stand or squat","Wall or incline push-up","Glute bridge","Bird dog","March in place"],
    ["Supported reverse lunge","Incline push-up","Hip hinge","Dead bug","Calf raise"],
    ["Squat variation","Push-up variation","Single-leg bridge or regular bridge","Side plank variation","Easy walk"],
    ["Supported split squat","Incline push-up","Glute bridge","Bird dog","March in place"]
   ];
   return {day:days[[0,2,4,5][i]],minutes:novice?18:28,location:gym?"Gym":"Home / no equipment",warmup:"3–4 minutes easy movement and joint mobility",movements:risk?["HOLD — obtain individualized clearance and coaching review"]:movements[i],dose:risk?"Do not start this workout until reviewed.":novice?"1–2 rounds, 6–10 controlled repetitions; 45–90 seconds rest as needed.":"2–3 rounds, 8–12 controlled repetitions; 45–90 seconds rest as needed.",progression:"Increase difficulty only when movement is controlled and recovery is good; reduce load or stop if symptoms appear."};
 });
 const protein=first(a.NU15,"eggs, beans, fish, poultry or a tolerated alternative");
 const plants=first(a.NU16,"seasonal vegetables and fruit");
 const time=a.NU12||"15–30 min";
 const budget=a.NU18||"Not specified";
 const mealCount=parseInt(a.NU1,10)||3;
 const template=[
 ["Eggs with fruit and oats","Chicken, vegetables and rice","Lentil and vegetable soup"],
 ["Plain yogurt, fruit and oats","Salmon, greens and potatoes","Bean and vegetable bowl"],
 ["Egg and vegetable scramble","Turkey or tofu with rice and vegetables","Leftover vegetable and protein plate"],
 ["Oats with milk or fortified alternative and fruit","Chickpea and vegetable bowl","Fish or beans with potatoes"],
 ["Yogurt or tolerated protein with berries","Restaurant: protein, vegetables, suitable starch","Vegetable omelet or bean bowl"],
 ["Eggs, fruit and whole-grain toast","Chicken or tofu, roasted vegetables","Lentil stew"],
 ["Oats, fruit and nuts if tolerated","Fish or beans, rice and vegetables","Simple leftovers with vegetables"]
 ];
 const meals=days.map((day,i)=>{
  const entries=template[i];
  return {day,meals:allergies?["COACH MUST VERIFY ALLERGEN-SAFE MEAL","COACH MUST VERIFY ALLERGEN-SAFE MEAL","COACH MUST VERIFY ALLERGEN-SAFE MEAL"]:mealCount<=1?[entries[1]+" + "+entries[2]]:mealCount===2?[entries[0],entries[1]+" + "+entries[2]]:entries,prep:time,budget,note:(i===4&&a.NU13!=="Rarely"?"Eating out: choose a meal matching your restrictions and hunger. ":i===2&&a.EN3&&a.EN3!=="Rarely"?"Travel: plan shelf-stable or accessible options. ":"")+"Swap only after checking allergies, dislikes and dietary restrictions."};
 });
 const priorities=basePlan.scores.pillars.flatMap(p=>p.domains.map(d=>({pillar:p.name,name:d.name,score:d.value}))).filter(d=>d.score!==null).sort((a,b)=>a.score-b.score).slice(0,3);
 const stages=[
 ["Foundations","Baseline, sleep timing, simple meals and comfortable movement"],
 ["Build","Consistency, strength technique, food preparation and stress skills"],
 ["Progress","Adjust training volume and routines to your recovery and goals"],
 ["Resilience","Travel, busy days, restaurant decisions and sustainable accountability"],
 ["Ownership","Maintain progress, reflect and prepare the next 12 weeks"]
 ];
 const weekly=Array.from({length:12},(_,i)=>{
  const stage=i<2?stages[0]:i<5?stages[1]:i<8?stages[2]:i<10?stages[3]:stages[4];
  const theme=basePlan.week[i].theme;
  const primary=priorities[i%Math.max(1,priorities.length)];
  return {week:i+1,phase:stage[0],theme,body:goal==="Muscle and strength"?"Complete planned strength sessions and review recovery.":goal==="Fat loss"?"Keep meals structured and movement sustainable; avoid extreme restriction.":"Complete realistic movement and recovery habits.",soul:i%2===0?"Use a two-minute evening reflection; plan one next action.":"Notice a common trigger and prepare an alternative response.",spirit:i%2===0?"Set aside a short daily time for Scripture and prayer.":"Practice gratitude, prayer and service within your routine.",focus:primary?primary.pillar+" · "+primary.name:"Build a consistent baseline",check:"Review energy, sleep, adherence, training comfort and one win with your coach."};
 });
 const daily=[
 ["Wake","Daylight and water; brief prayer or Scripture as desired"],
 ["Morning","First meal according to hunger, schedule and clinician guidance"],
 ["Workday","Movement breaks and a practical planned meal"],
 ["Training","Up to 30 minutes on chosen training days; walking on others"],
 ["Evening","Prepare tomorrow's food and schedule; reflection and screen wind-down"],
 ["Sleep","Aim for a regular, adequate sleep opportunity adjusted to your circumstances"]
 ];
 const warnings=[];
 if(risk)warnings.push("Health or symptom answers require individual professional review. Exercise and nutrition changes are on hold pending appropriate clearance.");
 if(allergies)warnings.push("Food restrictions or allergies reported: no specific meal ingredients should be used without review.");
 if(missingVitals)warnings.push("Age, height or weight is missing or outside supported ranges; energy estimates unavailable.");
 if(equation===null)warnings.push("No sex-based equation was selected; energy estimate intentionally withheld.");
 if(a.G4!=="No")warnings.push("Eating-disorder history or uncertainty: do not prescribe calories, weight-loss targets or fasting.");
 if(a.G5!=="No")warnings.push("Mental-health crisis response: automated recommendations must not substitute for urgent professional help.");
 if(a.SL5==="Yes")warnings.push("Possible sleep-disordered breathing: encourage clinical assessment.");
 const calories=warnings.length||!maintenance?null:{estimatedResting:bmr,estimatedMaintenance:maintenance,note:"Rough population-equation estimates only, not a prescription. No automatic calorie deficit or target is assigned."};
 return {...basePlan,version:"v4-personalized-plan-1",goal,objectives,priorities,weekly,workouts,mealPlan:meals,daily,calories,warnings,allergies,requiresCoachApproval:true,notes:{...basePlan.notes,foodPreferences:[a.NU15,a.NU16].filter(Boolean).join(" | ")||"Not specified",budget,prepTime:time,mealsPerDay:mealCount,homeGym:a.TR6||"Home / no equipment",weekend:a.PR10||"Not specified",schedule:a.PR9||"Not provided",reminder:a.EN6||"Flexible / coach decides"}};
}
function html(a,p){
 const row=items=>items.map(x=>"<tr>"+x.map(v=>"<td>"+safe(v)+"</td>").join("")+"</tr>").join("");
 const scores=p.scores.pillars.map(v=>'<div class="score"><b>'+safe(v.name)+'</b><strong>'+(v.value===null?"Incomplete":v.value+"/100")+'</strong><p>'+v.domains.map(d=>safe(d.name)+": "+(d.value===null?"—":d.value)).join(" · ")+'</p></div>').join("");
 const weekly=row(p.weekly.map(w=>[w.week,w.phase+" · "+w.theme,w.body,w.soul,w.spirit,w.focus]));
 const meals=row(p.mealPlan.map(m=>[m.day,m.meals.join(" | "),m.note]));
 const workouts=p.workouts.map(w=>'<div class="panel"><h3>'+safe(w.day)+' · '+w.minutes+' min · '+safe(w.location)+'</h3><p>'+safe(w.warmup)+'</p><ol>'+w.movements.map(m=>"<li>"+safe(m)+"</li>").join("")+'</ol><p>'+safe(w.dose)+'</p><p>'+safe(w.progression)+'</p></div>').join("");
 const alerts=p.warnings.map(w=>"<li>"+safe(w)+"</li>").join("");
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GodHealth · 12-Week Transformation Plan</title><style>@page{size:A4;margin:16mm}*{box-sizing:border-box}body{margin:0;background:#061a10;color:#f8f3e6;font:14px/1.65 Inter,Arial,sans-serif}.wrap{max-width:1100px;margin:auto;padding:36px 24px}h1,h2{font-family:Georgia,serif;color:#e8c777}h1{font-size:48px;line-height:1.1}h2{font-size:29px;margin-top:35px;border-bottom:1px solid #ae8b45;padding-bottom:8px}h3{color:#edcc83}.eyebrow{letter-spacing:.2em;color:#edcc83}.panel,.score,.notice{border:1px solid #ad8d50;background:#102c1d;border-radius:15px;padding:18px;margin:12px 0}.score{display:inline-block;vertical-align:top;width:31%;margin-right:1%}.score strong{display:block;font-size:32px;color:#f1d693}.notice{border-color:#e3aa65}table{width:100%;border-collapse:collapse;font-size:12px}td,th{border-bottom:1px solid #786d4b;padding:9px;text-align:left;vertical-align:top}th{color:#f1d693}.action{background:#e6c16e;color:#102519;border:0;padding:14px 22px;border-radius:30px;font-weight:700;cursor:pointer}ol,ul{padding-left:22px}tr,.panel,.score{break-inside:avoid}@media(max-width:600px){h1{font-size:35px}.score{display:block;width:100%}.wrap{padding:20px 14px}table{font-size:11px}}@media print{body{background:white;color:#18271b}.wrap{padding:0}h1,h2,h3,.eyebrow,th,.score strong{color:#805b20}.panel,.score,.notice{background:white;border-color:#a59b80}.action{display:none}table{font-size:9px}thead{display:table-header-group}tfoot{display:table-footer-group}tr{break-inside:avoid;page-break-inside:avoid}h1{font-size:36px}h2{break-after:avoid;page-break-after:avoid}.panel{break-inside:avoid;page-break-inside:avoid}}</style></head><body><div class="wrap"><button class="action" onclick="window.print()">Save as PDF / Print</button><p class="eyebrow">GODHEALTH · BODY · SOUL · SPIRIT</p><h1>Your 12-Week<br>Transformation Blueprint</h1><p>Personalized assessment report · '+new Date().toISOString().slice(0,10)+' · Draft for coach approval</p><div class="notice"><b>COACH APPROVAL REQUIRED — NOT A MEDICAL OR DIETETIC PRESCRIPTION</b><p>This document is an individualized starting draft based on self-reported answers. A qualified coach must verify safety, food restrictions, feasibility and goals before use. Do not start a flagged training or nutrition change without appropriate clearance. Emergency symptoms require local emergency care.</p>'+(alerts?"<ul>"+alerts+"</ul>":"")+'</div><h2>1. Your Capacity Snapshot</h2><p><b>Overall:</b> '+(p.scores.overall??"Incomplete")+'/100 · <b>Primary goal:</b> '+safe(p.goal)+'</p>'+scores+'<h2>2. Your Personal Priorities</h2><ol>'+p.objectives.map(x=>"<li>"+safe(x)+"</li>").join("")+'</ol><p><b>Lowest-scoring focus areas:</b> '+p.priorities.map(x=>safe(x.pillar+" — "+x.name+" ("+x.score+"/100)")).join("; ")+'</p><p><b>Schedule:</b> '+safe(p.notes.schedule)+' · <b>Training window:</b> '+safe(p.notes.trainingWindow)+'</p><h2>3. Your 12-Week Roadmap</h2><table><thead><tr><th>Week</th><th>Phase and theme</th><th>Body</th><th>Soul</th><th>Spirit</th><th>Personal focus</th></tr></thead><tbody>'+weekly+'</tbody></table><h2>4. Your Training Plan</h2><p>Home training requires no equipment by default. Sessions last 18–28 minutes including warm-up. On other days, use optional comfortable walking or mobility as appropriate. Stop for pain, dizziness, chest discomfort or concerning breathlessness.</p>'+workouts+'<h2>5. Your 7-Day Meal Plan</h2><p><b>Preferred foods:</b> '+safe(p.notes.foodPreferences)+' · <b>Restrictions:</b> '+safe(p.notes.restrictions)+' · <b>Cooking time:</b> '+safe(p.notes.prepTime)+' · <b>Weekly budget:</b> '+safe(p.notes.budget)+'</p><p>Meal ideas use minimally processed whole foods where practical, consistent with GodHealth’s faith-based food philosophy. Actual ingredient choices, portions, allergies and nutritional adequacy require review. This is not a calorie-controlled prescription.</p><table><thead><tr><th>Day</th><th>Meals</th><th>Practical adaptation</th></tr></thead><tbody>'+meals+'</tbody></table><h2>6. Daily Routine & Accountability</h2><table><tbody>'+row(p.daily)+'</tbody></table><p><b>Preferred reminder:</b> '+safe(p.notes.reminder)+'. Daily reminders are not automatically sent by this standalone assessment.</p><h2>7. Your Weekly Review</h2><p>Each week, record sleep consistency, daily energy, training completion, meal practicality, emotional wellbeing and Scripture/prayer rhythm. Review barriers and adapt the next week with your coach.</p><p><b>Energy estimate:</b> '+(p.calories?"Approximate maintenance "+p.calories.estimatedMaintenance+" kcal/day; not a calorie target.":"Not provided because additional individual review is needed.")+'</p><p class="eyebrow">GODHEALTH · STEWARDSHIP · CONSISTENCY · PURPOSE</p></div></body></html>';
}
window.GodHealthV4.plan=plan;
window.GodHealthV4.reportHtml=(a)=>html(a,plan(a));
})();