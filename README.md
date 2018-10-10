Crawl Wikipedia pages and upload TTS to Youtube.



## setup

1. Follow setup at [@wikipedia-tts/youtube].



## console

```bash
wikipedia-tts <command> [page] [options]
# --help: show this help
# -d | --db: crawl database file (crawl.db)
# -o | --output: output file (null)
# --priority: update page priority (0)
# --references: update page references (0)
# --uploaded: update page uploaded status (0)
# Environment variables:
# WIKIPEDIA_TTS_DB: crawl database file

wikipedia-tts upload "Ladakh"
# "Ladakh" is uploaded to youtube

wikipedia-tts add "Plant nutrition"
# "Plant nutrition" is added to crawl list

wikipedia-tts crawl
# "Plant nutrition" is uploaded to youtube
# All links in "Plant nutrition" page are added to crawl list

wikipedia-tts crawl
# Most referenced link in crawl list is uploaded to youtube
# All links in the page are added to crawl list
```



## package

```javascript
const wikipediaTts = require('wikipedia-tts');
// wikipediaTts.setup([db path]): db conn (promise)
// wikipediaTts.add(<db>, <page>): add page to crawl list (promise)
// wikipediaTts.remove(<db>, <page>): remove page from crawl list (promise)
// wikipediaTts.update(<db>, <page>, <value>): update page priority/references/uploaded in crawl list (promise)
// wikipediaTts.upload(<db>, <page>): upload particular page in crawl list (promise)
// wikipediaTts.crawl(<db>): upload page from crawl list, and add links from page (promise)
// wikipediaTts(<output>, <page>, [options]): upload page to youtube
// -> <wikijs page> (promise)

/* More options: @wikipedia-tts/youtube */
// [options]: {
//   db: $WIKIPEDIATTS_DB||'crawl.db'
// }


wikipediaTts(null, 'Ladakh');
// "Ladakh" is uploaded to youtube


var db = await wikipediaTts.setup();
// crawl.db is created

await wikipediaTts.add(db, 'Plant nutrition');
// "Plant nutrition" is added to crawl list

await wikipediaTts.crawl(db);
// "Plant nutrition" is uploaded to youtube
// All links in "Plant nutrition" page are added to crawl list

await wikipediaTts.crawl(db);
// Most referenced link in crawl list is uploaded to youtube
// All links in the page are added to crawl list
```


[![wikipedia-tts](https://i.imgur.com/Uu0KJ1U.jpg)](https://www.npmjs.com/package/wikipedia-tts)

[@wikipedia-tts/youtube]: https://www.npmjs.com/package/@wikipedia-tts/youtube
