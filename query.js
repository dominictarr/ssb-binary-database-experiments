var FlumeViewQuery = require('flumeview-query')
var CompareAt = require('compare-at')
var bipf = require('bipf')
var pull = require('pull-stream')

function encode (value) {
  var b = Buffer.alloc(bipf.encodingLength(value))
  bipf.encode(value, b, 0)
  return b
}

module.exports = function (opts, cb) {

  function Decode () {
    return pull.map(function (buf) {
      return bipf.decode(buf, 0)
    })
  }

  function Index(index) {
    return {
      value: index.paths,
      key: index.name,
      exact: true,
      since: index.index.since,
      createStream: function (opts) {
        opts.gte = encode(CompareAt.valuePathToObject(opts.gte, index.paths))
        opts.lte = encode(CompareAt.valuePathToObject(opts.lte, index.paths))
        delete opts.index
        //decode so that map-filter-reduce can handle it.
        //bipf.decode is slow, but the indexes should have done
        //most of the work, so it shouldn't be too bad.
        //ideally, the query engine would be able to handle bipf format.
        return pull(index.index.read(opts), Decode())
      }
    }
  }

  require('./indexes')(opts, function (err, indexes, log) {
    var start = Date.now()
    var query = FlumeViewQuery(1, {indexes: []})(
    //need to pass a fake log to flumeview query, so that if it does full scan,
    //the bipf records are decoded. this will be slow, need to rewrite query engine
    //to operate directly on bipf, which will be fast!
    { stream: function (opts) {
        return pull(log.stream(opts), Decode())
      },
      since: log.since,
      filename: log.filename
    },
    '_')

      console.log(query)

    for(var k in indexes)
      query.add(Index(indexes[k]))

    cb(null, query)
  })
}

if(!module.parent) {
  var opts = require('minimist')(process.argv.slice(2))
  module.exports(opts, function (err, query) {
    if(err) throw err
    var start = Date.now()
    //default query, messages since yesterday.
    var since_yesterday = [
          {$filter: {value: {
            content: { type: 'post' },
            timestamp: {$gt: Date.now() - 1000*60*60*24}
          }}}
      ]

    if(opts.query)
      opts.query = JSON.parse(opts.query)
    else {
      opts.query = since_yesterday
      opts.limit = 1000
    }
    var c = 0
    console.error(query.explain(opts))
    pull(
      query.read(opts),
      pull.drain(function (e) {
        c++
        console.log(JSON.stringify(e)+'\n')
      }, function () {
        console.error('query', c, (Date.now() - start)/1000)
      })
    )

  })
}

