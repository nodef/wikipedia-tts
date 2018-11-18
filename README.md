Crawl Wikipedia pages and upload TTS to YouTube.
> Do you want to:
> - Upload Wikipedia TTS videos on YouTube?
<br>


## setup

1. Install [Node.js], if not installed.
2. Run `npm install -g wikipedia-tts` in [console].
3. To install this as a package use `npm install wikipedia-tts`.
1. Follow setup at [extra-googletts].
2. Follow setup at [extra-youtubeuploader].
<br>


## console

```bash
wikipedia-tts <command> [page] [options]
# --help: show this help
# -l, --log: enable log
# -o, --output: set output file
# -d, --db:     set crawl database file (crawl.db)
# -p, --priority:   set page priority (0)
# -r, --references: set page references (0)
# -s, --status:     set page status (0)
# -t, --times:  times to crawl/upload (1)
# Environment variables:
# WIKIPEDIATTS_LOG: enable logging (0)
# WIKIPEDIATTS_DB: crawl database file (crawl.db)

wikipedia-tts "Ladakh"
# "Ladakh" is uploaded to YouTube

wikipedia-tts add "Plant nutrition"
# "Plant nutrition" is added to crawl list

wikipedia-tts update "Plant nutrition" --priority 1
# "Plant nutrition" priority is set to 1
# this means it will be crawled/uploaded first
# even if other pages have higher number of references

wikipedia-tts crawl
# "Plant nutrition" is page links are crawled
# this is because it is on top priority, references

wikipedia-tts crawl --times 10
# Crawling done recursively 10 times

wikipedia-tts upload
# Highest ranking page is crawled and uploaded to YouTube

wikipedia-tts upload --times 10
# Uploading done recursively 10 times
```



## package

```javascript
const wikipediaTts = require('wikipedia-tts');
// wikipediaTts.setup([db path]): db conn (promise)
// wikipediaTts.get<db>, <page>): {title, priority, references, status} (promise)
// wikipediaTts.add(<db>, <page>): page (promise)
// wikipediaTts.remove(<db>, <page>): page (promise)
// wikipediaTts.update(<db>, <page>, [value]): page (promise)
// wikipediaTts.crawl(<db>, [options]): times crawled (promise)
// wikipediaTts.upload(<db>, [options]): times uploaded (promise)
// wikipediaTts(<output>, <page>, [options]): Upload page to YouTube
// -> <wikijs page> (promise)

/* More options: @wikipedia-tts/youtube */
// [options]: {
//   db: $WIKIPEDIATTS_DB||'crawl.db',
//   input: {
//     text: null,
//     image: null,
//     tags: null,
//     description: null
//   }
// }


wikipediaTts(null, 'Ladakh');
// "Ladakh" is uploaded to youtube


var db = await wikipediaTts.setup();
// crawl list is created (crawl.db)

await wikipediaTts.add(db, 'Plant nutrition');
// "Plant nutrition" is added to crawl list

await wikipediaTts.update(db, 'Plant nutrition',  {priority: 1});
// "Plant nutrition" priority is set to 1
// this means it will be crawled/uploaded first
// even if other pages have higher number of references

await wikipediaTts.crawl(db);
// "Plant nutrition" is page links are crawled
// this is because it is on top priority, references

await wikipediaTts.crawl(db, {loop: 10});
// Crawling done recursively 10 times

await wikipediaTts.upload(db);
// Highest ranking page is crawled and uploaded to YouTube
```


[![wikipedia-tts](https://i.imgur.com/Uu0KJ1U.jpg)](https://www.npmjs.com/package/wikipedia-tts)

[Node.js]: https://nodejs.org/en/download/
[console]: https://en.wikipedia.org/wiki/Shell_(computing)#Text_(CLI)_shells
[extra-googletts]: https://www.npmjs.com/package/extra-googletts
[extra-youtubeuploader]: https://www.npmjs.com/package/extra-youtubeuploader
