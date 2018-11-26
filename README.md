## a much faster database!

Hey everyone. Now is time to tell you all, I've been somewhat
secretly working on a better database. Not _secret_ secret,
but I havn't been talking about my plans. mainly so I could
enjoy working on it without the weight of expectations as
to why it's taking so long ;)

The first commit to a key part of this, Normalized Index,
was August 17, 2016. I recall I was staying on @mikey's couch
at the time. Flumedb itself was also part of this effort,
but that's been deployed for a while. This is now the rest
of the ideas I had, about ready to be rolled out.

tl;dr - it's faster, and uses significantly less memory.
indexes are way smaller, and just as fast. It's still written
in javascript, in fact, it's written _entirely in javascript_.

## components

The core idea in flumedb, is that the main storage is a log file,
referenced by the byte offset. views, such as indexes, point back
into this. I've been rethinking various aspects of the system,
and just this weekend, I've been finally fitting them together.

### flumelog-aligned-offset

This is basically the same ideas as `flumelog-offset`, but
a better implementation that doesn't have [the performance
problems flumelog-offset](%Gs2NhjWxbNQrsOu1AtL4w8x7BudcvbE5CY8Uc+14DA4=.sha256)
had. It's also built on top of dat's [random-access-file](https://github.com/random-access-storage),
for hopefully easy browser support, and better collaboration with dat!

### bipf (binary in place format)

As it turned out, JSON parsing is really quite slow. It's not
just the parsing it self, but also it's allocating the js objects,
which also use a lot more memory than their serializations.
However, you can have a format _designed for use without parsing_.
Meaning, a format optimized for finding a particular value
and pulling it out, without looking at every field in the whole
object. databases queries mostly will only look at one or two fields,
compare that to something then throw it away or write to IO.
There are _many_ binary json replacements, but very few of them
are intended for in-place use. I implemented one, and was really
quite suprised how fast it was. Combined with a better flumelog,
this actually makes it possible to do queries by reading every
value in the database!

### normalized-index

`normalized-index` takes the idea of indexes that are just
pointers to it's logical extreme - it's a log-structured-merge tree,
like leveldb. A "log-structured merge tree" is essentially
a reordering of the database, from some particular perspective,
with a clever way to _merge_ sections you've already ordered together.
We are already using a LSMT in level, but because leveldb isn't
aware of flume, it needs to store keys in level, and that makes
the level indexes quite large. normalized-index doesn't store keys
at all, only pointers. Currently, the indexes for ssb-query
(using level) are 99 mb (on my machine) the same indexes created
with `normalized-index` are only 20 mb.
Using `bipf` and `flumelog-aligned-offset`, a `normalized-index`
builds a little faster than the same index did with level using
json. Query time is about the same, _fast enough_, but index
size is much better.

That means potentially, we can have way _more_ indexes,
the main constraint here being to avoid increasing indexing time.

## demonstration

I havn't rolled this into scuttlebutt yet, but I have scripts
that demonstate it all in action.

clone this repo, npm install then,
```
node init.js # copy your .ssb/flume/log.offset file into bipf format.
node indexes.js # generate indexes using normalized-index
node query.js # run a default query on top of those indexes.

node query.js --query '{QUERY}' # run a custom query, in map-filter-reduce json format.
```

## todo

* gather feedback
* rewrite flumeview-reduces to benefit from bipf.
* lazy indexes.
* map-filter-reduce directly on bipf format, so no parsing ever.
* bikeshed best design for bipf.

## future work

This would suit being reimplemented in C. Likely this would make it even faster.
The simple way to evaluate that would implement bipf in C, then flumelog-aligned,
then compare scan perf.

Investigate how much performance we can hope for on mobile, or in browsers.

## License

MIT



