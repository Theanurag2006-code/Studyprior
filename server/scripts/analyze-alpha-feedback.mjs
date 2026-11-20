#!/usr/bin/env node
/** Summarize anonymous StudyPrior alpha JSON files; never changes source data. */
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(scriptDir, '..');
const projectRoot = resolve(serverRoot, '..');
const inputArg = process.env.ALPHA_FEEDBACK_DIR ?? 'docs/alpha-feedback-responses';
const inputDir = isAbsolute(inputArg) ? inputArg : resolve(projectRoot, inputArg);
let fileNames;
try { fileNames = readdirSync(inputDir).filter(name => name.toLowerCase().endsWith('.json')); }
catch (error) {
  console.error(`Cannot read feedback folder ${inputDir}: ${error.message}`);
  console.error('Create docs/alpha-feedback-responses and place anonymous JSON responses there.');
  process.exit(1);
}
const valid = [];
const invalid = [];
for (const name of fileNames) {
  try {
    const data = JSON.parse(readFileSync(resolve(inputDir, name), 'utf8'));
    if (data.schema !== 'studyprior-alpha-feedback-v1' || !data.taskEase || !data.recommendationQuality) throw new Error('unsupported feedback format');
    valid.push(data);
  } catch (error) { invalid.push({ file: name, error: error.message }); }
}
const metricKeys = {
  taskEase: ['findTopic','understandPriority','compareRatings','shareExperience','saveAndPlan','seniorConnection'],
  recommendationQuality: ['priorityClarity','recommendationRelevance','confidenceClarity','ratingUsefulness'],
};
const label = {
  findTopic:'Find a topic', understandPriority:'Understand priority', compareRatings:'Compare ratings',
  shareExperience:'Share experience', saveAndPlan:'Save / plan', seniorConnection:'Connect with a senior',
  priorityClarity:'Priority clarity', recommendationRelevance:'Recommendation relevance',
  confidenceClarity:'Confidence clarity', ratingUsefulness:'Rating usefulness',
};
function valuesFor(section, key) {
  return valid.map(x => x[section]?.[key]).filter(v => v !== undefined && v !== null && v !== 'N/A' && Number.isFinite(Number(v))).map(Number);
}
function stats(section, key) {
  const values = valuesFor(section, key);
  return { responses: values.length, average: values.length ? Number((values.reduce((a,b)=>a+b,0)/values.length).toFixed(2)) : null,
    lowScores: values.filter(v => v <= 2).length, highScores: values.filter(v => v >= 4).length };
}
const summaries = Object.entries(metricKeys).flatMap(([section, keys]) => keys.map(key => ({ metric: label[key], ...stats(section,key) })));
const overall = valid.map(x => Number(x.overallRating)).filter(Number.isFinite);
const roles = {};
for (const item of valid) { const role = item.session?.role ?? 'Unspecified'; roles[role] = (roles[role] ?? 0) + 1; }
const themes = {
  priorityReason: valid.map(x=>x.comments?.priorityReason).filter(Boolean),
  missing: valid.map(x=>x.comments?.missing).filter(Boolean),
  bug: valid.map(x=>x.comments?.bug).filter(Boolean),
  improvement: valid.map(x=>x.comments?.improvement).filter(Boolean),
};
const recommendation = valid.reduce((acc,x)=>{const k=x.wouldUseAgain ?? 'Unanswered';acc[k]=(acc[k]??0)+1;return acc;},{});
const report = { generatedAt:new Date().toISOString(), feedbackFolder:inputDir, validResponses:valid.length, invalidFiles:invalid,
  roles, metrics:summaries, overallRating:{responses:overall.length,average:overall.length?Number((overall.reduce((a,b)=>a+b,0)/overall.length).toFixed(2)):null},
  wouldUseAgain:recommendation, anonymizedCommentThemes:themes };
const outputDir = resolve(serverRoot,'data','performance','reports');
mkdirSync(outputDir,{recursive:true});
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const jsonPath=resolve(outputDir,`alpha-feedback-summary-${stamp}.json`);
const mdPath=resolve(outputDir,`alpha-feedback-summary-${stamp}.md`);
writeFileSync(jsonPath,JSON.stringify(report,null,2));
const lines=['# StudyPrior alpha feedback summary','',`- Generated: ${report.generatedAt}`,`- Valid responses: ${valid.length}`,`- Invalid files skipped: ${invalid.length}`,'',
'## Respondent mix','',...Object.entries(roles).map(([role,count])=>`- ${role}: ${count}`),'',
'## Ratings','', '| Area | Responses | Average (1–5) | Ratings 1–2 | Ratings 4–5 |','|---|---:|---:|---:|---:|',
...summaries.map(x=>`| ${x.metric} | ${x.responses} | ${x.average ?? '—'} | ${x.lowScores} | ${x.highScores} |`),
'',`Overall experience average: ${report.overallRating.average ?? '—'} (${report.overallRating.responses} responses)`,'',
'## Would use StudyPrior again','',...Object.entries(recommendation).map(([answer,count])=>`- ${answer}: ${count}`),'',
'## Anonymized written feedback (review before quoting)',''];
for(const [key,title] of [['priorityReason','What shaped trust in priority'],['missing','Missing topics/details'],['bug','Bugs/confusion'],['improvement','Suggested improvements']]){
  lines.push(`### ${title}`,'');
  if(themes[key].length) for(const comment of themes[key]) lines.push(`- ${comment.replace(/\s+/g,' ').trim()}`);
  else lines.push('- No comments submitted.');
  lines.push('');
}
lines.push('## Decision guidance','','Do not change the priority formula from one response or a single anecdote. Look for repeated low scores or a consistent theme across different respondent categories. Record the observed issue, proposed decision, regression test, and before/after comparison. Preserve the separation between priority, difficulty and confidence.');
writeFileSync(mdPath,lines.join('\n'));
console.log(`Valid responses: ${valid.length}`);
console.log(`Invalid files skipped: ${invalid.length}`);
console.log(`Saved JSON: ${jsonPath}`);
console.log(`Saved Markdown: ${mdPath}`);
if(invalid.length) process.exitCode=1;
