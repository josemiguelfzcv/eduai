import { AcademySection } from './components/landing/AcademySection'
import { ClassroomSection } from './components/landing/ClassroomSection'
import { FinalCTA, SiteFooter } from './components/landing/Closing'
import { Hero } from './components/landing/Hero'
import { LyceumSection } from './components/landing/LyceumSection'
import { SiteNav } from './components/landing/SiteNav'

export default function Home() {
  return (
    <>
      <SiteNav />
      <main id="main" className="overflow-x-clip">
        <Hero />
        <AcademySection />
        <ClassroomSection />
        <LyceumSection />
        <FinalCTA />
      </main>
      <SiteFooter />
    </>
  )
}
