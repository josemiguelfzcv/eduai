import { createUploadthing, createRouteHandler, type FileRouter } from 'uploadthing/next'
import { UploadThingError } from 'uploadthing/server'
import { requireUser } from '../../lib/server/auth'

const f = createUploadthing()

export const ourFileRouter = {
  materialUploader: f({
    pdf: { maxFileSize: '32MB', maxFileCount: 1 },
    audio: { maxFileSize: '32MB', maxFileCount: 1 },
  })
    .middleware(async ({ req }) => {
      try {
        const { user } = await requireUser(req)
        return { userId: user.id }
      } catch {
        throw new UploadThingError('Sign in to upload files.')
      }
    })
    .onUploadComplete(async ({ file }) => ({ url: file.ufsUrl })),
} satisfies FileRouter

export type OurFileRouter = typeof ourFileRouter

export const { GET, POST } = createRouteHandler({ router: ourFileRouter })
