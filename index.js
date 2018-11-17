#!/usr/bin/env node
const youtubeuploader = require('extra-youtubeuploader');
const stillvideo = require('extra-stillvideo');
const googletts = require('extra-googletts');
const wiki = require('wikijs').default;
const download = require('download');
const isVideo = require('is-video');
const boolean = require('boolean');
const sqlite = require('sqlite');
const tempy = require('tempy');
const _ = require('lodash');
const cp = require('child_process');
const https = require('https');
const path = require('path');
const fs = require('fs');


// Global variables
const E = process.env;
const OPTIONS = {
  log: boolean(E['WIKIPEDIATTS_LOG']||'0'),
  db: E['WIKIPEDIATTS_DB']||'crawl.db',
  times: parseInt(E['WIKIPEDIATTS_TIMES']||'1', 10),
  video: {
    fitX: parseInt(E['STILLVIDEO_FITX']||'1024', 10),
    fitY: parseInt(E['STILLVIDEO_FITY']||'1024', 10)
  },
  youtube: {
    descriptionpath: E['YOUTUBEUPLOADER_DESCRIPTIONPATH']||path.join(__dirname, 'description.txt'),
    title: E['YOUTUBEUPLOADER_TITLE']||'${title} | Wikipedia audio article',
    tags: E['YOUTUBEUPLOADER_TAGS']||'${tags},wikipedia audio article,learning by listening,increases imagination and understanding,improves your listening skills,improves your own spoken accent,learn while on the move,reduce eye strain,text to speech',
    privacystatus: E['YOUTUBEUPLOADER_PRIVACYSTATUS']||'public',
    embeddable: boolean(E['YOUTUBEUPLOADER_EMBEDDABLE']||'true'),
    license: E['YOUTUBEUPLOADER_LICENSE']||'creativeCommon',
    publicstatsviewable: boolean(E['YOUTUBEUPLOADER_PUBLICSTATSVIEWABLE']||'true'),
    category: E['YOUTUBEUPLOADER_CATEGORY']||'27'
  }
};
const VALUE = {
  priority: parseInt(E['WIKIPEDIATTS_PRIORITY']||'0', 10),
  references: parseInt(E['WIKIPEDIATTS_REFERENCES']||'0', 10),
  status: parseInt(E['WIKIPEDIATTS_STATUS']||'0', 10)
};
const CATEGORY_EXC = /wikipedia|webarchive|infocard|infobox|chembox|article|page|dmy|cs1|[^\w\s\(\)]/i;
const PAGEIMAGES_URL = 'https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&format=json&piprop=original&titles=';
const BLANKIMAGE_URL = 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Wikipedia-logo-blank.svg/1000px-Wikipedia-logo-blank.svg.png';
const COMMANDS = new Set(['setup', 'get', 'add', 'remove', 'update', 'upload', 'crawl']);
const IMGFORMAT = /\.(png|jpe?g)$/i;
const FN_NOP = () => 0;


// Write to file, return promise.
function fsWriteFile(pth, dat, o) {
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
  if(IMGFORMAT.test(img)) return img;
  var img = await pag.mainImage();
  if(IMGFORMAT.test(img)) return img;
  var imgs = await pag.images();
  for(var i of imgs||[])
    if(IMGFORMAT.test(i)) return i;
  return img||BLANKIMAGE_URL;
};

// Get thumb image for page.
async function pageThumbImage(pag, o) {
  var url = await pageImage(pag);
  if(!url.endsWith('.svg')) return url;
  var fx = _.get(o||{}, 'video.fitX', OPTIONS.video.fitX);
  url = url.replace(/\/wikipedia\/(.*?)\/(thumb\/)?/, '/wikipedia/$1/thumb/');
  return url+`/${fx}px-`+path.basename(url)+'.jpg';
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
async function wikipediatts(out, nam, o) {
  var o = o||{}, l = o.log, i = o.input||{};
  var out = out||o.output, nam = nam||o.input;
  if(l) console.log('@wikipediatts:', out);
  var p = await wiki().page(nam);
  var [txt, img, tags, description] = await Promise.all([
    i.text||p.content(), i.image||pageThumbImage(p, o),
    i.tags||pageCategories(p), i.description||p.summary()
  ]);
  if(!tags.includes(nam)) tags.unshift(nam);
  if(l) {
    console.log(' .name:', nam);
    console.log(' .tags:', tags);
    console.log(' .mainImage:', img);
    console.log(' .description:', description);
  }
  var val = {title: nam, description, tags};
  var mod = out==null? 2:(isVideo(out)? 1:0);
  var imgf = img.includes('://')? await downloadTemp(img):img;
  var audf = mod>=1? tempy.file({extension: 'mp3'}):out;
  var vidf = mod>=2? tempy.file({extension: 'mp4'}):out;
  var capf = mod>=2? tempy.file({extension: 'txt'}):null;
  var metf = mod>=2? tempy.file({extension: '.json'}):null;
  if(mod>=0) await googletts(audf, txt, Object.assign({log: l}, o.audio));
  if(mod>=1) await stillvideo(vidf, audf, imgf, Object.assign({log: l}, o.video));
  if(mod>=2) await fsWriteFile(capf, txt);
  if(mod>=2) await fsWriteFile(metf, JSON.stringify(val));
  if(mod>=2) await youtubeuploader(Object.assign({log: l, video: vidf, caption: capf, meta: metf}, o.youtube));
  if(imgf!==img) fs.unlink(imgf, FN_NOP);
  if(mod>=1) fs.unlink(audf, FN_NOP);
  if(mod>=2) fs.unlink(vidf, FN_NOP);
  if(mod>=2) fs.unlink(capf, FN_NOP);
  return p;
};

// Get a page for crawl.
async function getCrawl(db, o) {
  var o = o||{};
  if(o.log) console.log('-getCrawl:');
  var whr = '"status" = 0', ord = '"priority" DESC, "references" DESC';
  var row = await db.get(`SELECT * FROM "pages" WHERE ${whr} ORDER BY ${ord} LIMIT 1`);
  if(o.log) console.log(' .row', row);
  return row;
};

// Get a page for upload.
async function getUpload(db, o) {
  var o = o||{};
  if(o.log) console.log('-getUpload:');
  var whr = '"status" = 0 OR "status" = 1', ord = '"priority" DESC, "references" DESC';
  var row = await db.get(`SELECT * FROM "pages" WHERE ${whr} ORDER BY ${ord} LIMIT 1`);
  if(o.log) console.log(' .row', row);
  return row;
};

// Upload page, if unique.
async function uploadUnique(nam, o) {
  var o = o||{};
  if(o.log) console.log('-uploadUnique:', nam);
  var ids = await youtubeuploader.lines({title: nam});
  if(ids.length) {
    if(o.log) console.log(' .already exists:', ids);
    return 2;
  }
  try { await wikipediatts(null, nam, o); }
  catch(e) {
    console.error(e);
    return e.message==='No article found'? -2:-4;
  }
  return 4;
};

// Crawl one page.
async function crawlOne(db, nam, o) {
  var o = o||{};
  if(o.log) console.log('-crawlOne:', nam);
  var p = await wiki().page(nam);
  var lnks = p? await pageLinks(p):[];
  if(o.log) console.log(' .links:', lnks.length);
  await sqlRunMapJoin(db, 'INSERT OR IGNORE INTO "pages" VALUES ', lnks, () => '(?, 0, 0, 0)', ', ');
  await sqlRunMapJoin(db, 'UPDATE "pages" SET "references" = "references" + 1 WHERE ', lnks, () => '"title" = ?', ' OR ');
  return p;
};

// Setup crawl list.
async function setup(pth, o) {
  var o = _.merge({}, OPTIONS, o), pth = pth||o.db;
  var db = await sqlite.open(pth);
  if(o.log) console.log('-setup:', pth);
  var col = '"title" TEXT PRIMARY KEY, "priority" INTEGER, "references" INTEGER, "status" INTEGER';
  await db.exec(`CREATE TABLE IF NOT EXISTS "pages" (${col})`);
  return db;
};

// Get a page from crawl list.
async function get(db, nam, o) {
  var o = _.merge({}, OPTIONS, o), db = db||o.db;
  db = typeof db==='string'? await setup(db, o):db;
  var nam = nam||o.input;
  if(o.log) console.log('-get:', nam);
  var row = await db.get('SELECT * "pages" WHERE "title" = ? LIMIT 1', nam);
  if(o.log) console.log(' .row:', row);
  return row;
};

// Add a page to crawl list.
async function add(db, nam, o) {
  var o = _.merge({}, OPTIONS, VALUE, o), db = db||o.db;
  db = typeof db==='string'? await setup(db, o):db;
  var nam = nam||o.input, v = _.pick(o, ['priority', 'references', 'status']);
  if(o.log) console.log('-add:', nam, v);
  await db.run('INSERT OR IGNORE INTO "pages" VALUES (?, ?, ?, ?)', nam, v.priority, v.references, v.status);
  return nam;
};

// Remove a page from crawl list.
async function remove(db, nam, o) {
  var o = _.merge({}, OPTIONS, o), db = db||o.db;
  db = typeof db==='string'? await setup(db, o):db;
  var nam = nam||o.input;
  if(o.log) console.log('-remove:', nam);
  await db.run('DELETE FROM "pages" WHERE "title" = ?', nam);
  return nam;
};

// Update a page in crawl list.
async function update(db, nam, o) {
  var o = _.merge({}, OPTIONS, o), db = db||o.db;
  db = typeof db==='string'? await setup(db, o):db;
  var nam = nam||o.input, v = _.pick(o, ['priority', 'references', 'status']);
  if(o.log) console.log('-update:', nam, v);
  var val = {$title: nam};
  for(var k in v) val['$'+k] = v[k];
  var set = Object.keys(v).map(col => `"${col}" = $${col}`).join(', ');
  db.run(`UPDATE "pages" SET ${set} WHERE "title" = $title`, val);
  return nam;
};

// Upload a page.
async function upload(db, o) {
  var o = _.merge({}, OPTIONS, o), db = db||o.db;
  db = typeof db==='string'? await setup(db, o):db;
  if(o.log) console.log('-upload:', _.pick(o, ['loop']));
  for(var i=0, I=o.loop||1; i<I; i++) {
    try {
      var row = await getUpload(db, o);
      if(!row) break;
      var status = await uploadUnique(row.title, o);
      await update(db, row.title, {status}, o);
      if(row.status===0) await crawlOne(db, row.title, o);
    }
    catch(e) { console.error(e); }
  }
  return i;
};

// Crawl a page.
async function crawl(db, o) {
  var o = _.merge({}, OPTIONS, o), db = db||o.db;
  db = typeof db==='string'? await setup(db, o):db;
  var status = 1;
  if(o.log) console.log('-crawl:', _.pick(o, ['loop']));
  for(var i=0, I=o.loop||1; i<I; i++) {
    try {
      var row = await getCrawl(db, o);
      if(!row) break;
      await update(db, row.title, {status}, o);
      await crawlOne(db, row.title, o);
    }
    catch(e) { console.error(e); }
  }
  return i;
};

// Get options from arguments.
function options(o, k, a, i) {
  o.audio = o.audio||{};
  o.video = o.video||{};
  o.youtube = o.youtube||{};
  if(k==='--help') o.help = true;
  else if(k==='-d' || k==='--db') o.db = a[++i];
  else if(k==='-o' || k==='--output') o.output = a[++i];
  else if(k==='-p' || k==='--priority') o.priority = a[++i];
  else if(k==='-r' || k==='--references') o.references = a[++i];
  else if(k==='-s' || k==='--status') o.status = a[++i];
  else if(k==='-t' || k==='--times') o.times = a[++i];
  else if(k.startsWith('-a')) i = googletts.options(o.audio, '-'+a.substring(2), a, i);
  else if(k.startsWith('-v')) i = stillvideo.options(o.video, '-'+a.substring(2), a, i);
  else if(k.startsWith('-y')) i = youtubeuploader.options(o.youtube, '-'+a.substring(2), a, i);
  else if(k.startsWith('--audio_')) i = googletts.options(o.audio, '--'+k.substring(8), a, i);
  else if(k.startsWith('--video_')) i = stillvideo.options(o.video, '--'+k.substring(8), a, i);
  else if(k.startsWith('--youtube_')) i = youtubeuploader.options(o.youtube, '--'+k.substring(10), a, i);
  else if(!o.command) o.command = a[i];
  else o.input = a[i];
  return i+1;
};

wikipediatts.setup = setup;
wikipediatts.get = get;
wikipediatts.add = add;
wikipediatts.remove = remove;
wikipediatts.update = update;
wikipediatts.upload = upload;
wikipediatts.crawl = crawl;
wikipediatts.options = options;
module.exports = wikipediatts;

// Run on shell.
async function shell(a) {
  for(var i=2, I=a.length, o={}; i<I;)
    i = options(o, a[i], a, i);
  var cmd = o.command, out = o.output, nam = o.input;
  if(o.help) return cp.execSync('less README.md', {cwd: __dirname, stdio: [0, 1, 2]});
  if(!COMMANDS.has(cmd)) return wikipediatts(out, nam, o);
  var db = await setup(o.db, o);
  if(cmd==='setup') return;
  else if(cmd==='get') await get(db, nam, o);
  else if(cmd==='add') await add(db, nam, o);
  else if(cmd==='remove') await remove(db, nam, o);
  else if(cmd==='update') await update(db, nam, o);
  else if(cmd==='upload') await upload(db, o);
  else await crawl(db, o);
};
if(require.main===module) shell(process.argv);
