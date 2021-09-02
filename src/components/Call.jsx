import React, { useState, useEffect } from "react";
import * as borsh from "borsh";
import { Alert, Button, Space, Col, Typography } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import {
  Connection,
  PublicKey,
  Keypair,
  TransactionInstruction,
  sendAndConfirmTransaction,
  Transaction,
  SystemProgram,
} from "@solana/web3.js";

import {
  getNodeRpcURL,
  getAccountExplorerURL,
  getNodeWsURL,
  getTxExplorerURL,
} from "../lib/utils";

const { Text } = Typography;

// The state of a greeting account managed by the hello world program
class GreetingAccount {
  counter = 0;
  constructor(fields = undefined) {
    if (fields) {
      this.counter = fields.counter;
    }
  }
}

// Borsh schema definition for greeting accounts
const GreetingSchema = new Map([
  [GreetingAccount, { kind: "struct", fields: [["counter", "u32"]] }],
]);

// The expected size of each greeting account.
const GREETING_SIZE = borsh.serialize(
  GreetingSchema,
  new GreetingAccount()
).length;

const PAYER_SECRET_KEY = [
  119, 87, 178, 107, 149, 206, 159, 207, 66, 52, 136, 179, 58, 170, 145, 49, 81,
  34, 240, 130, 51, 181, 223, 129, 129, 24, 171, 44, 114, 4, 73, 24, 10, 41,
  195, 117, 228, 74, 242, 107, 57, 76, 150, 39, 243, 106, 108, 15, 145, 100,
  243, 36, 6, 243, 45, 59, 140, 174, 5, 193, 199, 56, 138, 114,
];
const PROGRAM_SECRET_KEY = [
  75, 33, 87, 166, 103, 199, 6, 144, 124, 215, 183, 22, 151, 50, 99, 8, 113, 41,
  147, 22, 158, 218, 192, 74, 173, 117, 114, 165, 33, 171, 242, 47, 75, 166, 93,
  127, 57, 66, 50, 195, 100, 40, 66, 60, 180, 59, 66, 246, 225, 106, 116, 223,
  46, 17, 170, 125, 35, 207, 36, 208, 8, 255, 74, 14,
];

const Program = () => {
  const [connection, setConnection] = useState(null);
  const [programId, setProgramId] = useState(null);
  const [greeterPublicKey, setGreeterPublicKey] = useState(null);
  const [greetingsCounter, setGreetingsCounter] = useState(null);
  const [greetFetching, setGreetFetching] = useState(false);
  const [greetTxSignature, setGreetTxSignature] = useState(null);

  useEffect(() => {
    establishConnection();
  }, []);

  const establishConnection = () => {
    const url = getNodeRpcURL();
    const connection = new Connection(url, { wsEndpoint: getNodeWsURL() });
    setConnection(connection);
  };

  const checkProgram = async () => {
    if (!PAYER_SECRET_KEY || !PROGRAM_SECRET_KEY) {
      alert("Set PAYER_SECRET_KEY and PROGRAM_SECRET_KEY first!");
    }

    const programSecretKey = new Uint8Array(PROGRAM_SECRET_KEY);
    const programKeypair = Keypair.fromSecretKey(programSecretKey);
    const programId = programKeypair.publicKey;
    setProgramId(programId);

    // // Check if the program has been deployed
    // await connection.getAccountInfo(programId);
    // console.log(`Using program ${programId.toBase58()}`);

    const payerSecretKey = new Uint8Array(PAYER_SECRET_KEY);
    const payerKeypair = Keypair.fromSecretKey(payerSecretKey);

    // Derive the address of a greeting account from the program so that it's easy to find later.
    const GREETING_SEED = "hello";
    const greetedPubkey = await PublicKey.createWithSeed(
      payerKeypair.publicKey,
      GREETING_SEED,
      programId
    );
    setGreeterPublicKey(greetedPubkey);

    // Check if the greeting account has already been created
    const greetedAccount = await connection.getAccountInfo(greetedPubkey);
    if (greetedAccount === null) {
      console.log(
        "Creating account",
        greetedPubkey.toBase58(),
        "to say hello to"
      );
      const lamports = await connection.getMinimumBalanceForRentExemption(
        GREETING_SIZE
      );

      const transaction = new Transaction().add(
        SystemProgram.createAccountWithSeed({
          fromPubkey: payerKeypair.publicKey,
          basePubkey: payerKeypair.publicKey,
          seed: GREETING_SEED,
          newAccountPubkey: greetedPubkey,
          lamports,
          space: GREETING_SIZE,
          programId,
        })
      );

      sendAndConfirmTransaction(connection, transaction, [payerKeypair])
        .then((res) => console.log(`res`, res))
        .catch((err) => console.log(`err`, err));
    }
  };

  const greet = async () => {
    // Load the payer's Keypair from the Uint8Array PAYER_SECRET_KEY
    // by using Keypair.fromsecretkey
    // https://solana-labs.github.io/solana-web3.js/classes/keypair.html#fromsecretkey
    const payerSecretKey = new Uint8Array(PAYER_SECRET_KEY);
    const payerKeypair = Keypair.fromSecretKey(payerSecretKey);

    // Create the TransactionInstruction by passing keys, programId and data
    // For data you can pass Buffer.alloc(0) as all the program's instructions are the same
    const instruction = new TransactionInstruction({
      keys: [{ pubkey: greeterPublicKey, isSigner: false, isWritable: true }],
      programId,
      data: Buffer.alloc(0), // All instructions are hellos
    });

    // Call sendAndConfirmTransaction
    // https://solana-labs.github.io/solana-web3.js/modules.html#sendandconfirmtransaction
    // On success, call getGreetings() to fetch the greetings counter
    setGreetFetching(true);
    sendAndConfirmTransaction(connection, new Transaction().add(instruction), [
      payerKeypair,
    ])
      .then((res) => {
        console.log(`SUCCESS`, res);
        setGreetTxSignature(res);
        setGreetFetching(false);
        getGreetings();
      })
      .catch((err) => {
        console.log(`ERROR`, err);
        setGreetFetching(false);
      });
  };

  const getGreetings = async () => {
    const accountInfo = await connection.getAccountInfo(greeterPublicKey);

    if (accountInfo === null) throw "Error: cannot find the greeted account";

    const greeting = borsh.deserialize(
      GreetingSchema,
      GreetingAccount,
      accountInfo.data
    );

    setGreetingsCounter(greeting.counter);
  };

  if (!greeterPublicKey) {
    return (
      <Space>
        <Button type="primary" onClick={checkProgram}>
          Check Program Info
        </Button>
      </Space>
    );
  }

  return (
    <Col>
      <Space direction="vertical" size="large">
        <Space direction="horizontal" size="large">
          <Button type="default" onClick={checkProgram}>
            Check Program Info
          </Button>
          <Text strong>Program deployed!</Text>
          <a
            href={getAccountExplorerURL(programId.toString())}
            target="_blank"
            rel="noreferrer"
          >
            View program on Solana Explorer
          </a>
        </Space>
        <Button type="primary" onClick={greet}>
          Send a greeting to the program
        </Button>
        {greetFetching && (
          <Space size="large">
            <LoadingOutlined style={{ fontSize: 24, color: "#1890ff" }} spin />
            <Text italic={true} type="secondary">
              Transaction initiated. Waiting for confirmations...
            </Text>
          </Space>
        )}
        {greetTxSignature && !greetFetching && (
          <Alert
            message={
              <Space direction="horizontal">
                <Text strong>Transaction confirmed!</Text>
                <Text>{`Greetings Counter: ${greetingsCounter}`}</Text>
              </Space>
            }
            description={
              <a
                href={getTxExplorerURL(greetTxSignature)}
                target="_blank"
                rel="noreferrer"
              >
                View transaction on Solana Explorer
              </a>
            }
            type="success"
            showIcon
          />
        )}
      </Space>
    </Col>
  );
};

export default Program;
