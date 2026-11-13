import { ActionRows } from "@/components/marketing/action-rows";
import { Bento } from "@/components/marketing/bento";
import { Hero } from "@/components/marketing/hero";
import { Navbar } from "@/components/marketing/navbar";
import { Standard } from "@/components/marketing/standard";
import { Statement } from "@/components/marketing/statement";

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Statement />
        <Bento />
        <ActionRows />
        <Standard />
      </main>
    </>
  );
}
