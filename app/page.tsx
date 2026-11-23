import { AcademySection } from './components/landing/AcademySection'
import { FinalCTA, SiteFooter } from './components/landing/Closing'
import { Hero } from './components/landing/Hero'
import { LearningSection } from './components/landing/LearningSection'
import { LyceumSection } from './components/landing/LyceumSection'
import { SiteNav } from './components/landing/SiteNav'

/** The landing (desktop): the hero, My Academy, the learning experience and The Lyceum, one continuous scroll. */
export default function Home() {
  return (
    <>
      <SiteNav />
      <main id="main" className="min-w-[1024px] overflow-x-clip">
        <Hero />
        <AcademySection />
        <LearningSection />
        <LyceumSection />
        <FinalCTA />
      </main>
      <SiteFooter />
    </>
  )
}
