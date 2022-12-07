import { NativeModules, NativeEventEmitter } from 'react-native'
import DownloadTask from './lib/downloadTask'
const { RNBackgroundDownloader } = NativeModules
const RNBackgroundDownloaderEmitter = new NativeEventEmitter(RNBackgroundDownloader)

const tasksMap = new Map()
let headers = {}

RNBackgroundDownloaderEmitter.addListener('downloadProgress', events => {
  for (const event of events) {
    const task = tasksMap.get(event.id)
    if (task)
      task._onProgress(event.percent, event.written, event.total)
  }
})

RNBackgroundDownloaderEmitter.addListener('downloadComplete', ({ id, location }) => {
  const task = tasksMap.get(id)
  if (task)
    task._onDone({ location })

  tasksMap.delete(id)
})

RNBackgroundDownloaderEmitter.addListener('downloadFailed', event => {
  const task = tasksMap.get(event.id)
  if (task)
    task._onError(event.error, event.errorcode)

  tasksMap.delete(event.id)
})

RNBackgroundDownloaderEmitter.addListener('downloadBegin', ({ id, expectedBytes, headers }) => {
  const task = tasksMap.get(id)
  if (task)
    task._onBegin({ expectedBytes, headers })
})

export function setHeaders (h = {}) {
  if (typeof h !== 'object')
    throw new Error('[RNBackgroundDownloader] headers must be an object')

  headers = h
}

export function checkForExistingDownloads () {
  return RNBackgroundDownloader.checkForExistingDownloads()
    .then(foundTasks => {
      return foundTasks.map(taskInfo => {
        const task = new DownloadTask(taskInfo, tasksMap.get(taskInfo.id))
        if (taskInfo.state === RNBackgroundDownloader.TaskRunning) {
          task.state = 'DOWNLOADING'
        } else if (taskInfo.state === RNBackgroundDownloader.TaskSuspended) {
          task.state = 'PAUSED'
        } else if (taskInfo.state === RNBackgroundDownloader.TaskCanceling) {
          task.stop()
          return null
        } else if (taskInfo.state === RNBackgroundDownloader.TaskCompleted) {
          if (taskInfo.bytesWritten === taskInfo.totalBytes)
            task.state = 'DONE'
          else
          // IOS completed the download but it was not done.
            return null
        }
        tasksMap.set(taskInfo.id, task)
        return task
      }).filter(task => task !== null)
    })
}

export function completeHandler (jobId) {
  return RNBackgroundDownloader.completeHandler(jobId)
}

export function download (options) {
  if (!options.id || !options.url || !options.destination)
    throw new Error('[RNBackgroundDownloader] id, url and destination are required')

  options.headers = options.headers && typeof options.headers === 'object'
    ? { ...headers, ...options.headers }
    : headers

  options.metadata = options.metadata && typeof options.metadata === 'object'
    ? JSON.stringify(options.metadata)
    : JSON.stringify({})

  RNBackgroundDownloader.download(options)
  const task = new DownloadTask({ id: options.id, metadata: options.metadata })
  tasksMap.set(options.id, task)
  return task
}

export const directories = {
  documents: RNBackgroundDownloader.documents,
}

export const Network = {
  WIFI_ONLY: RNBackgroundDownloader.OnlyWifi,
  ALL: RNBackgroundDownloader.AllNetworks,
}

export const Priority = {
  HIGH: RNBackgroundDownloader.PriorityHigh,
  MEDIUM: RNBackgroundDownloader.PriorityNormal,
  LOW: RNBackgroundDownloader.PriorityLow,
}

export default {
  download,
  checkForExistingDownloads,
  completeHandler,
  setHeaders,
  directories,
  Network,
  Priority,
}
