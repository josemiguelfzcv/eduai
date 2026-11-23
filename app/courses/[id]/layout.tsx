import { CourseFrame } from '../../components/learn/workspace'

/** Pages of one course share its learning environment (the course sidebar and Ask Lyceo) where it's on. */
export default function CourseLayout({ children }: { children: React.ReactNode }) {
  return <CourseFrame>{children}</CourseFrame>
}
