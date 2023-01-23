import { faker } from "https://raw.githubusercontent.com/jackfiszr/deno-faker/master/mod.ts";
import { Collection } from "./collection.ts";
import { TcpRedis } from "./db/mod.ts";

type User = {
  name: string;
  email: string;
  isHuman: boolean;

  address: {
    street: string;
    number: number;
  };
};

async function main() {
  const db = await TcpRedis.connect({
    hostname: "<HOSTNAME>",
    port: 0, // <PORT>
    password: "<PASSWORD>",
    tls: true,
  });

  const c = new Collection<User>("users", db);
  const i = c.index({
    name: "users_by_street",
    terms: ["address.street", "name"],
    values: ["name", "isHuman"],
  });

  const r = c.range({
    name: "user_by_street_number",
    term: "address.number",
  });

  await c.createDocument({
    name: "andreas",
    email: "andreas@upstash.com",
    isHuman: true,
    address: {
      street: "some street",
      number: 2,
    },
  });

  const res = await r.range({
    min: 0,
    max: 10,
  });
  console.log({ res });

  // await c.updateDocument(andreas.id, { isHuman: false });

  for (let i = 0; i < 50; i++) {
    await c.createDocument({
      name: faker.name.findName(),
      email: faker.internet.email(),
      isHuman: Math.random() > 0.9,
      address: {
        street: faker.address.streetAddress(),
        number: faker.random.number({ min: 1, max: 1000 }),
      },
    });
  }

  const users = await i.match({
    "address.street": "123 Main St",
    "name": "",
  });
  console.log(users);
  // console.log(
  //   "range: ",
  //   await r.range({
  //     min: 18,
  //     max: 30,
  //   }),
  // );

  // await c.deleteDocument(andreas.id);
}
main();
