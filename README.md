# Agentic Claim Processing Demo

Recording: https://drive.google.com/file/d/1OtyOe7e9EhkOD828UYfTyME647oAMI4T/view?usp=sharing


# Services

* Restate Services (agnets): `npm run dev`  -> :9080
* Interview web ui: `npm run chatapp`  -> :3000
* Interview requests to terminal `npm run usernotivy`
* Human-in-the-loop approval `npm run approver`


# Sample invocation

curl localhost:8080/claims/process -H 'idempotency-key: abc' --json '{
  "amount": 1000,
  "description": "my iPhone was dropped and now it is broken",
  "images": [
    "./pictures/broken_iphone.png"
  ],
  "user": {
    "email": "sam@gmail.com",
    "name": "Samuel Gauthier"
  }
}'

# Kafka

(1) Start Kafka by doing `docker compose up` in the `./kafka` directory.

(2) Put events into Kafka via the console producer

```bash
docker run --rm -it --net=host confluentinc/cp-kafka:7.5.0 /bin/bash
kafka-console-producer --topic claims --bootstrap-server localhost:9092
```

Sample events
```
{ "amount": 2000, "description": "some stone hit my windshield", "images": [ "./pictures/windshield.jpg" ], "user": { "email": "a@b.com", "name": "Anders Barthia" } }

{ "amount": 3500, "description": "A bird crashed into my MacBook", "images": [ "./pictures/broken_macbook.jpg" ], "user": { "email": "c@d.com", "name": "Charles Dickens" } }

{ "amount": 400, "description": "My toaster went up in flames. The toaster is broken, but I also needed to repaint some parts of the kitchen.", "images": [ "./pictures/broken_toaster.png" ], "user": { "email": "e@f.com", "name": "Emily Foster" } }
```

Unprocessable event (without code update) because references non-existing image
```
{ "amount": 400, "description": "My toaster went up in flames. The toaster is broken, but I also needed to repaint some parts of the kitchen.", "images": [ "./pictures/broken_toaster.jpg" ], "user": { "email": "e@f.com", "name": "Emily Foster" } }
```

(3) Create subscription

```bash
curl localhost:9070/subscriptions --json '{
  "source": "kafka://my-cluster/claims",
  "sink": "service://claims/process",
  "options": {"auto.offset.reset": "earliest"}
}'
```