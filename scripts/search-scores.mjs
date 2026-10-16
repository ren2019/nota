import {searchSources} from '../app/server/score-import.mjs';
const query=process.argv.slice(2).join(' ');console.log(JSON.stringify(await searchSources(query),null,2));
