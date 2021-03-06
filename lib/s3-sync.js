import { Promise, all as waitForAllPromises } from 'rsvp'
import S3 from 's3'
import ora from 'ora'
import http from 'http'
import https from 'https'
import humanSize from 'human-size'
import { merge } from 'lodash'

// To increase s3's download & upload dir perf
http.globalAgent.maxSockets = https.globalAgent.maxSockets = 30

const { AWS_ACCESS_KEY, AWS_SECRET_KEY, AWS_SHOULD_PUBLISH } = process.env

const client = S3.createClient({
	s3Options: {
		accessKeyId: AWS_ACCESS_KEY,
		secretAccessKey: AWS_SECRET_KEY,
	},
})

const jsonDocsDirDownloadOptions = {
	localDir: 'tmp/json-docs',
	s3Params: {
		Bucket: 'api-docs.emberjs.com',
		Prefix: 'json-docs',
	},
}

const jsonDocsDirUploadOptions = merge({}, jsonDocsDirDownloadOptions, {
	s3Params: {
		ACL: 'public-read',
		CacheControl: 'max-age=365000000, immutable',
	},
})

let revDocsDirDownloadOptions = {
	localDir: 'tmp/rev-index',
	s3Params: {
		Bucket: 'api-docs.emberjs.com',
		Prefix: 'rev-index',
	},
}

const revDocsDirUploadOptions = merge({}, revDocsDirDownloadOptions, {
	s3Params: {
		ACL: 'public-read',
	},
})

const syncDir = (operation, options) => {
	return new Promise((resolve, reject) => {
		let isDownload = operation === 'download'

		let sync = isDownload ? client.downloadDir(options) : client.uploadDir(options)
		let progressIndicator = ora(`${operation}ing ${options.s3Params.Prefix} docs`).start()

		sync.on('progress', () => {
			const { progressAmount, progressTotal } = sync
			progressIndicator.text = `${operation}ing json docs (${humanSize(
				progressAmount
			)} of ${humanSize(progressTotal)})`
		})

		sync.on('end', () => {
			progressIndicator.succeed(`${operation}ed ${options.s3Params.Prefix} docs`)
			resolve()
		})

		sync.on('error', err => {
			progressIndicator.fail()
			reject(err)
		})
	})
}

export function downloadExistingDocsToLocal() {
	return waitForAllPromises([
		syncDir('download', jsonDocsDirDownloadOptions),
		syncDir('download', revDocsDirDownloadOptions),
	])
}

export function uploadToS3() {
	if (AWS_SHOULD_PUBLISH === 'yes') {
		return syncDir('upload', jsonDocsDirUploadOptions).then(() =>
			syncDir('upload', revDocsDirUploadOptions)
		)
	}
	return Promise.resolve()
}
