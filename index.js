#!/usr/bin/env node
const youtubeuploader = require('extra-youtubeuploader');
const stillvideo = require('extra-stillvideo');
const googletts = require('extra-googletts');
const download = require('download');
const isVideo = require('is-video');
const boolean = require('boolean');
const sqlite = require('sqlite');
const tempy = require('tempy');
const wiki = require('wikijs').default;
const cp = require('child_process');
const https = require('https');
const path = require('path');
const fs = require('fs');


// Global variables
const E = process.env;
const A = process.argv;
const LOG = boolean(E['WIKIPEDIATTS_LOG']||'0');
const DB = E['WIKIPEDIATTS_DB']||'crawl.db';
const CATEGORY_EXC = /wikipedia|webarchive|infocard|infobox|chembox|article|page|dmy|cs1|[^\w\s\(\)]/i;
const PAGEIMAGES_URL = 'https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&format=json&piprop=original&titles=';
const BLANKIMAGE_URL = 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Wikipedia-logo-blank.svg/1000px-Wikipedia-logo-blank.svg.png';
const ROW_DEFAULT = {priority: 0, references: 0, status: 0};
const FN_NOP = () => 0;


// Write to file, return promise.
function fsWriteFile(pth, dat, o) {
  if(o && o.log) console.log('fsWriteFile:', pth);
  return new Promise((fres, frej) => fs.writeFile(pth, dat, o, (err) => {
    return err? frej(err):fres(pth);
  }));
};

// Make HTTPS GET request.
function httpsGet(opt) {
  return new Promise((fres, frej) => https.get(opt, (res) => {
    var err = null, cod = res.statusCode, dat = '';
    if(cod!==200) err = new Error(`HTTPS GET failed (${cod}).\n${opt}`);
    if(err) { res.resume(); return frej(err); }
    res.setEncoding('utf8');
    res.on('data', (cnk) => dat+=cnk);
    res.on('end', () => fres(dat));
  }).on('error', frej));
};

// Download file to temp.
async function downloadTemp(url) {
  var ext = path.extname(url);
  var pth = tempy.file({extension: ext.substring(1)});
  await download(url, path.dirname(pth), {filename: path.basename(pth)});
  return pth;
};

// Get page image from wikipedia pageimages API response.
function wikiPageImage(res) {
  var pages = res.query.pages;
  if(!pages) return null;
  var page = pages[Object.keys(pages)[0]];
  if(!page.original) return null;
  return page.original.source;
};

// Get image for page.
async function pageImage(pag) {
  var wurl = PAGEIMAGES_URL+encodeURIComponent(pag.raw.title);
  var img = wikiPageImage(JSON.parse(await httpsGet(wurl)));
  if(img) return img;
  var img = await pag.mainImage();
  if(img && !img.endsWith('.svg')) return img;
  var imgs = await pag.images();
  for(var i of imgs||[])
    if(!i.endsWith('.svg')) return i;
  return img||BLANKIMAGE_URL;
};

// Get thumb image for page.
async function pageThumbImage(pag) {
  var url = await pageImage(pag);
  if(!url.endsWith('.svg')) return url;
  url = url.replace(/\/wikipedia\/(.*?)\/(thumb\/)?/, '/wikipedia/$1/thumb/');
  return url+'/1024px-'+path.basename(url)+'.jpg';
};

// Get categories for page.
async function pageCategories(pag) {
  var cats = await pag.categories(), z = [];
  for(var cat of cats) {
    var c = cat.replace('Category:', '');
    if(!CATEGORY_EXC.test(c)) z.push(c);
  }
  return z;
};

// Get forward links for page.
async function pageLinks(pag) {
  var z = await pag.links();
  return z;
};

// Run sql statement with map and join.
function sqlRunMapJoin(db, pre, dat, map, sep) {
  for(var i=0, I=dat.length, z= []; i<I; i+=256) {
    var prt = dat.slice(i, i+256);
    z.push(db.run(pre+prt.map(map).join(sep), prt));
  }
  return Promise.all(z);
};

// Upload Wikipedia page TTS to Youtube.
async function wikipediaTts(out, nam, o) {
  var o = o||{}, i = o.input||{};
  if(LOG) console.log('wikipediaTts:', out);
  var p = await wiki().page(nam);
  var [txt, img, tags, description] = await Promise.all([
    i.text||p.content(), i.image||pageThumbImage(p),
    i.tags||pageCategories(p), i.description||p.summary()
  ]);
  if(!tags.includes(nam)) tags.unshift(nam);
  if(LOG) {
    console.log(' -name:', nam);
    console.log(' -tags:', tags);
    console.log(' -mainImage:', img);
    console.log(' -description:', description);
  }
  var val = {title: nam, description, tags, privacyStatus: 'public', embeddable: true, license: 'creativeCommon', publicStatsViewable: true, categoryId: '27', language: 'en'};
  var mod = out==null? 2:(isVideo(out)? 1:0);
  var imgf = img.includes('://')? await downloadTemp(img):img;
  var audf = mod>=1? tempy.file({extension: 'mp3'}):out;
  var vidf = mod>=2? tempy.file({extension: 'mp4'}):out;
  var capf = mod>=2? tempy.file({extension: 'txt'}):null;
  var metf = mod>=2? tempy.file({extension: '.json'}):null;
  if(mod>=0) await googletts(audf, txt, {log: LOG});
  if(mod>=1) await stillvideo(vidf, audf, imgf, {log: LOG});
  if(mod>=2) await fsWriteFile(capf, txt);
  if(mod>=2) await fsWriteFile(metf, JSON.stringify(val));
  if(mod>=2) await youtubeuploader({log: LOG, video: vidf, caption: capf, meta: metf});
  if(imgf!==img) fs.unlink(imgf, FN_NOP);
  if(mod>=1) fs.unlink(audf, FN_NOP);
  if(mod>=2) fs.unlink(vidf, FN_NOP);
  if(mod>=2) fs.unlink(capf, FN_NOP);
  return p;
};

// Get a page for crawl.
async function getCrawl(db) {
  if(LOG) console.log('.getCrawl');
  var whr = '"status" = 0', ord = '"priority" DESC, "references" DESC';
  var row = await db.get(`SELECT * FROM "pages" WHERE ${whr} ORDER BY ${ord} LIMIT 1`);
  console.log('-row', row);
  return row;
};

// Get a page for upload.
async function getUpload(db) {
  if(LOG) console.log('.getUpload');
  var whr = '"status" = 0 OR "status" = 1', ord = '"priority" DESC, "references" DESC';
  var row = await db.get(`SELECT * FROM "pages" WHERE ${whr} ORDER BY ${ord} LIMIT 1`);
  console.log('-row', row);
  return row;
};

// Upload page, if unique.
async function uploadUnique(nam, o) {
  console.log('.uploadUnique', nam);
  var ids = await youtubeuploader.lines({title: nam});
  if(ids.length) {
    if(LOG) console.log('-already exists:', ids);
    return 2;
  }
  try { await wikipediaTts(null, nam, o); }
  catch(e) {
    if(LOG) console.error(e);
    return e.message==='No article found'? -2:-4;
  }
  return 4;
};

// Crawl one page.
async function crawlOne(db, nam) {
  if(LOG) console.log('.crawlOne', nam);
  var p = await wiki().page(nam);
  var lnks = p? await pageLinks(p):[];
  if(LOG) console.log('-links:', lnks.length);
  await sqlRunMapJoin(db, 'INSERT OR IGNORE INTO "pages" VALUES ', lnks, () => '(?, 0, 0, 0)', ', ');
  await sqlRunMapJoin(db, 'UPDATE "pages" SET "references" = "references" + 1 WHERE ', lnks, () => '"title" = ?', ' OR ');
  return p;
};

// Setup crawl list.
async function setup(pth) {
  var db = await sqlite.open(pth||DB);
  if(LOG) console.log('.setup', pth);
  var col = '"title" TEXT PRIMARY KEY, "priority" INTEGER, "references" INTEGER, "status" INTEGER';
  await db.exec(`CREATE TABLE IF NOT EXISTS "pages" (${col})`);
  return db;
};

// Get a page from crawl list.
async function get(db, nam) {
  if(LOG) console.log('.get', nam);
  var row = await db.get('SELECT * "pages" WHERE "title" = ? LIMIT 1', nam);
  console.log('-row', row);
  return row;
};

// Add a page to crawl list.
async function add(db, nam, o) {
  if(LOG) console.log('.add', nam, o);
  var o = Object.assign({}, ROW_DEFAULT, o);
  await db.run('INSERT OR IGNORE INTO "pages" VALUES (?, ?, ?, ?)', nam, o.priority, o.references, o.status);
  return nam;
};

// Remove a page from crawl list.
async function remove(db, nam) {
  if(LOG) console.log('.remove', nam);
  await db.run('DELETE FROM "pages" WHERE "title" = ?', nam);
  return nam;
};

// Update a page in crawl list.
async function update(db, nam, o) {
  if(LOG) console.log('.update', nam, o);
  var val = {$title: nam};
  for(var k in o) val['$'+k] = o[k];
  var set = Object.keys(o).map(col => `"${col}" = $${col}`).join(', ');
  db.run(`UPDATE "pages" SET ${set} WHERE "title" = $title`, val);
  return nam;
};

// Upload a page.
async function upload(db, o) {
  var o = o||{};
  if(LOG) console.log('.upload', o);
  for(var i=0, I=o.loop||1; i<I; i++) {
    try {
      var row = await getUpload(db);
      if(!row) break;
      var status = await uploadUnique(row.title, o);
      await update(db, row.title, {status});
      if(row.status===0) await crawlOne(db, row.title);
    }
    catch(e) { console.error(e); }
  }
  return i;
};

// Crawl a page.
async function crawl(db, o) {
  var o = o||{}, status = 1;
  if(LOG) console.log('.crawl', o);
  for(var i=0, I=o.loop||1; i<I; i++) {
    // try {
      var row = await getCrawl(db);
      if(!row) break;
      await update(db, row.title, {status});
      await crawlOne(db, row.title);
    // }
    // catch(e) { console.error(e); }
  }
  return i;
};
module.exports = wikipediaTts;
wikipediaTts.setup = setup;
wikipediaTts.get = get;
wikipediaTts.add = add;
wikipediaTts.remove = remove;
wikipediaTts.update = update;
wikipediaTts.upload = upload;
wikipediaTts.crawl = crawl;


// Main.
async function main() {
  var cmd = '', nam = '';
  var dbp = DB, out = '', priority = 0, references = 0, status = 0, loop = 1;
  var cmds = new Set(['setup', 'get', 'add', 'remove', 'update', 'upload', 'crawl']);
  for(var i=2, I=A.length; i<I; i++) {
    if(A[i]==='--help') return cp.execSync('less README.md', {cwd: __dirname, stdio: [0, 1, 2]});
    else if(A[i]==='-d' || A[i]==='--db') dbp = A[++i];
    else if(A[i]==='-o' || A[i]==='--output') out = A[++i];
    else if(A[i]==='-p' || A[i]==='--priority') priority = parseInt(A[++i], 10);
    else if(A[i]==='-r' || A[i]==='--references') references = parseInt(A[++i], 10);
    else if(A[i]==='-s' || A[i]==='--status') status = parseInt(A[++i], 10);
    else if(A[i]==='-l' || A[i]==='--loop') loop = parseInt(A[++i], 10);
    else if(!cmd) cmd = A[i];
    else if(!nam) nam = A[i];
  }
  if(!cmds.has(cmd)) return wikipediaTts(out, nam);
  var db = await setup(dbp);
  if(cmd==='setup') return;
  else if(cmd==='get') await get(db, nam);
  else if(cmd==='add') await add(db, nam, {priority, references, status});
  else if(cmd==='remove') await remove(db, nam);
  else if(cmd==='update') await update(db, nam, {priority, references, status});
  else if(cmd==='upload') await upload(db, {loop});
  else await crawl(db, {loop});
};
if(require.main===module) main();
