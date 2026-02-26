import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Graveshift } from "../target/types/graveshift";

describe("graveshift", () =>
{
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.Graveshift as Program<Graveshift>;

  it("Is initialized!", async () =>
  {
    // Add your test here.
    const ethAssetId = "poap-12345";
    const user = anchor.AnchorProvider.env().wallet.publicKey;
    const [migrationRecord, bump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("migration"), user.toBuffer(), Buffer.from(ethAssetId)],
      program.programId
    );
    const tx = await program.methods.initializeMigration(ethAssetId).accounts({
      migrationRecord: migrationRecord,
      user: user,
      systemProgram: anchor.web3.SystemProgram.programId,
    }).rpc();
    console.log("Your transaction signature", tx);
  });
});
