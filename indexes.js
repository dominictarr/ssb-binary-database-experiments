var NormalizedIndex = require('normalized-index')
var FlumeLogRaf = require('flumelog-aligned-offset')
var toCompat = require('flumelog-aligned-offset/compat')
var bipf = require('bipf')
var pull = require('pull-stream')
var toPull = require('push-stream-to-pull-stream')
var fs = require('fs')
var rmrf = require('rimraf')
var path = require('path')
var minimist = require('minimist')
var Hashtable = require('flumeview-hashtable')

module.exports = function (opts, cb) {
  var filename = opts.aligned || '/tmp/test-raf/log.aligned'
  var stat = fs.statSync(filename)
  var raf = toCompat(FlumeLogRaf(filename))
  var start = Date.now()

  var indexes_path = path.join(path.dirname(filename), 'indexes')

  if(opts.clean)
    rmrf.sync(indexes_path)

  function createHas(paths) {
    var getPaths = paths.map(function (path) {
      return bipf.createSeekPath(path)
    })
    return function (b) {
      for(var i = 0; i < getPaths.length; i++)
        if(!~getPaths[i](b, 0)) return false
      return true
    }
  }

  var _since = {}

  function connect (name, index) {
    var index_path = path.join(indexes_path, name)
    try {
      var index_stat = fs.statSync(index_path)
    } catch (_) {
      //if index doesn't exist yet, we'll create it.
    }

    //if the log has been newly created, rebuild indexes
    if(index_stat && stat.ctime > index.ctime)
      rmrf.sync(index_path)

    started ++
    raf.since.once(function (_seq) {
      index.since.once(function (seq) {
        _since[name] = seq
        console.error(['reindex', name, _seq - seq, seq].join(', '))
        var c = 0
        pull(
          raf.stream({gt: seq}),
          pull.through(function () {
            c++
          }),
          index.createSink(function () {
            console.log(['ended', name, c, index.since.value].join(', '))
            finished ++
            if(started === finished) next()
          })
        )
      })
    })
  }

  var indexes = {}

  var start = Date.now(), started = 0, finished = 0
  function Index (v) {
    var name = v.key, paths = v.value, ni
    //console.log('index', name)
    if(name == 'key') {
      var seekKey = bipf.createSeekPath(['key'])
      ni = Hashtable(1, function hash (key) {
        return key
      }, function getKey (data) {
//        console.log("KEY", data.toString('ascii', 10, 20))
        var c = seekKey(data, 0)
        return Buffer.from(data.toString('ascii', c+5, c+5+20), 'base64').readUInt32LE(0)
        //TODO: store cypherlinks as raw binary now base64
//        console.log(c, data.slice(c+3, c+3+8))
        return data.readUInt32LE(c+3) //slice(c+3, c+3+8) //slice out the binary key...
      }, 1024*128)(raf, 'indexes/key')
    } else {

      ni = NormalizedIndex(1, {
        paths: paths, has: createHas(paths), compare: bipf.createCompareAt(paths)
      })(raf, 'indexes/' + name)

    }
    indexes[name] = {index: ni, name: name, paths: paths, since: ni.since}

    connect(name, ni)
  }

  //the same indexes as ssb-query...
  require('./indexes.json').forEach(Index)

  if(opts.logging === false) return
  console.log(['seconds'].concat(Object.keys(indexes)).join(', '))

  function log_progress () {
    if(opts.logging === false) return
    var ts = Date.now()
    var line = [(ts - start)/1000]
    for(var k in indexes) {
      line.push(indexes[k].since.value)
    }
    console.log(line.join(', '))

  }
  var int = setInterval(log_progress, 1000)

  function next () {
    clearInterval(int)
    log_progress()
    cb && cb(null, indexes, raf)
  }

}

if(!module.parent)
  module.exports(minimist(process.argv.slice(2)))

