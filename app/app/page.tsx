import { Bento } from "@/components/marketing/bento";
import { Hero } from "@/components/marketing/hero";
import { Navbar } from "@/components/marketing/navbar";
import { Statement } from "@/components/marketing/statement";

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Statement />
        <Bento />
      </main>
    </>
  );
}
