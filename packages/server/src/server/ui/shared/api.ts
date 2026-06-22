export const FETCH_JSON_FN = `
async function fetchJSON(url,fallback){try{return await fetch(url).then(function(r){return r.json()})}catch(e){console.log("[fetchJSON] error",url,e);return fallback}}
`;
