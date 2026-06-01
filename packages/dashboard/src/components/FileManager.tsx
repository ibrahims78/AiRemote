import { useState, useRef, useEffect } from 'react'
import {
  Folder, File, ArrowLeft, Download, Upload,
  Home, RefreshCw, ChevronRight, HardDrive,
  Trash2, FolderPlus, Edit3, X, Check, AlertCircle
} from 'lucide-react'
import { clsx } from 'clsx'
import { api } from '../lib/api'

interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  size: number
  modified: string
  permissions: string
}

interface Props {
  deviceId: string
  deviceName: string
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export function FileManager({ deviceId, deviceName }: Props) {
  const [path, setPath] = useState('/')
  const [files, setFiles] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null)
  const [deletingFile, setDeletingFile] = useState<string | null>(null)
  const [renamingFile, setRenamingFile] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [showMkdir, setShowMkdir] = useState(false)
  const [mkdirName, setMkdirName] = useState('')
  const uploadRef = useRef<HTMLInputElement>(null)

  const pathParts = path.split('/').filter(Boolean)

  useEffect(() => {
    loadDir('/')
  }, [deviceId])

  async function loadDir(p: string) {
    setLoading(true)
    setError('')
    try {
      const res = await api.get(`/api/devices/${deviceId}/fs/list`, {
        params: { path: p },
        timeout: 15000
      })
      const sorted = (res.data as FileEntry[]).sort((a, b) => {
        if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name)
        return a.isDirectory ? -1 : 1
      })
      setFiles(sorted)
      setPath(p)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; code?: string; message?: string }
      const serverMsg = err.response?.data?.error || ''
      if (
        err.code === 'ECONNABORTED' ||
        serverMsg.includes('مهلة') ||
        serverMsg.includes('timeout') ||
        serverMsg.includes('منقطع')
      ) {
        setError('لم يستجب الأيجنت — تأكد من تشغيل الأيجنت على الجهاز والاتصال بالخادم')
      } else if (err.response?.data?.error?.includes('غير متصل') || (err.response as { status?: number } | undefined)?.status === 503) {
        setError('الجهاز غير متصل — شغّل الأيجنت على الجهاز أولاً')
      } else {
        setError(serverMsg || err.message || 'فشل تحميل المجلد')
      }
    } finally {
      setLoading(false)
    }
  }

  async function goUp() {
    if (path === '/') return
    const parts = path.split('/').filter(Boolean)
    parts.pop()
    await loadDir(parts.length === 0 ? '/' : '/' + parts.join('/'))
  }

  async function downloadFile(entry: FileEntry) {
    if (entry.isDirectory) return
    setDownloadingFile(entry.name)
    try {
      const res = await api.get(`/api/devices/${deviceId}/fs/download`, {
        params: { path: entry.path },
        responseType: 'blob'
      })
      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = entry.name
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string }
      setError(err.response?.data?.error || err.message || 'فشل التنزيل')
    } finally {
      setDownloadingFile(null)
    }
  }

  async function deleteFile(entry: FileEntry) {
    if (!confirm(`هل أنت متأكد من حذف "${entry.name}"؟`)) return
    setDeletingFile(entry.name)
    try {
      await api.post(`/api/devices/${deviceId}/fs/delete`, { path: entry.path })
      setFiles(prev => prev.filter(f => f.path !== entry.path))
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      setError(err.response?.data?.error || 'فشل الحذف')
    } finally {
      setDeletingFile(null)
    }
  }

  async function confirmRename(entry: FileEntry) {
    if (!renameValue.trim() || renameValue === entry.name) {
      setRenamingFile(null)
      return
    }
    const parentPath = path.endsWith('/') ? path : path + '/'
    const newPath = parentPath + renameValue.trim()
    try {
      await api.post(`/api/devices/${deviceId}/fs/rename`, { oldPath: entry.path, newPath })
      await loadDir(path)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      setError(err.response?.data?.error || 'فشل إعادة التسمية')
    } finally {
      setRenamingFile(null)
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('path', path)
      await api.post(`/api/devices/${deviceId}/fs/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      await loadDir(path)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      setError(err.response?.data?.error || 'فشل الرفع')
    } finally {
      setUploading(false)
      if (uploadRef.current) uploadRef.current.value = ''
    }
  }

  async function handleMkdir() {
    if (!mkdirName.trim()) return
    const newDirPath = (path.endsWith('/') ? path : path + '/') + mkdirName.trim()
    try {
      await api.post(`/api/devices/${deviceId}/fs/mkdir`, { path: newDirPath })
      setShowMkdir(false)
      setMkdirName('')
      await loadDir(path)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      setError(err.response?.data?.error || 'فشل إنشاء المجلد')
    }
  }

  return (
    <div className="flex flex-col h-full bg-navy-900 rounded-xl border border-slate-700/50 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-1 p-2.5 bg-navy-800 border-b border-slate-700/50 flex-shrink-0">
        <button onClick={() => loadDir('/')} className="p-1.5 text-slate-400 hover:text-white transition-colors rounded" title="الرئيسية">
          <Home size={13} />
        </button>
        <button onClick={goUp} disabled={path === '/'} className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 transition-colors rounded">
          <ArrowLeft size={13} />
        </button>
        <button onClick={() => loadDir(path)} className="p-1.5 text-slate-400 hover:text-white transition-colors rounded">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>

        {/* Breadcrumb */}
        <div className="flex items-center gap-0.5 text-xs text-slate-400 flex-1 overflow-hidden mx-1">
          <button onClick={() => loadDir('/')} className="text-slate-600 hover:text-white transition-colors">
            <HardDrive size={12} />
          </button>
          {pathParts.map((part, i) => (
            <span key={i} className="flex items-center gap-0.5">
              <ChevronRight size={10} className="text-slate-700 flex-shrink-0" />
              <button
                onClick={() => loadDir('/' + pathParts.slice(0, i + 1).join('/'))}
                className="hover:text-white transition-colors truncate max-w-[80px] px-0.5"
              >
                {part}
              </button>
            </span>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setShowMkdir(s => !s)}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
            title="مجلد جديد"
          >
            <FolderPlus size={12} />
          </button>
          <label className={clsx(
            'flex items-center gap-1 text-xs px-2 py-1 rounded cursor-pointer transition-colors',
            uploading ? 'text-brand-blue cursor-not-allowed' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
          )}>
            <Upload size={12} />
            {uploading ? 'رفع...' : 'رفع'}
            <input ref={uploadRef} type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
        </div>
      </div>

      {/* Mkdir inline form */}
      {showMkdir && (
        <div className="flex items-center gap-2 px-3 py-2 bg-navy-900/50 border-b border-slate-700/30 flex-shrink-0">
          <FolderPlus size={13} className="text-brand-teal flex-shrink-0" />
          <input
            autoFocus
            type="text"
            value={mkdirName}
            onChange={e => setMkdirName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleMkdir()
              if (e.key === 'Escape') { setShowMkdir(false); setMkdirName('') }
            }}
            placeholder="اسم المجلد الجديد"
            className="flex-1 bg-navy-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-brand-teal"
          />
          <button onClick={handleMkdir} className="p-1 text-emerald-400 hover:text-emerald-300"><Check size={13} /></button>
          <button onClick={() => { setShowMkdir(false); setMkdirName('') }} className="p-1 text-slate-500 hover:text-slate-300"><X size={13} /></button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-xs text-red-400 flex items-center gap-2 flex-shrink-0">
          <AlertCircle size={12} />
          {error}
          <button onClick={() => setError('')} className="ml-auto text-slate-500 hover:text-slate-300"><X size={11} /></button>
        </div>
      )}

      {/* File list */}
      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center py-10">
            <div className="w-5 h-5 border-2 border-brand-blue border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-navy-800/90 backdrop-blur">
              <tr className="border-b border-slate-700/30">
                <th className="text-right text-xs text-slate-500 font-medium px-4 py-2">الاسم</th>
                <th className="text-right text-xs text-slate-500 font-medium px-4 py-2 hidden sm:table-cell">الحجم</th>
                <th className="text-right text-xs text-slate-500 font-medium px-4 py-2 hidden md:table-cell">التعديل</th>
                <th className="text-right text-xs text-slate-500 font-medium px-4 py-2 hidden lg:table-cell">الصلاحيات</th>
                <th className="px-4 py-2 w-20" />
              </tr>
            </thead>
            <tbody>
              {files.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-slate-500 text-xs py-10">
                    <FolderPlus size={24} className="mx-auto mb-2 text-slate-700" />
                    المجلد فارغ
                  </td>
                </tr>
              )}
              {files.map((f, i) => {
                const isRenaming = renamingFile === f.path
                const isDeleting = deletingFile === f.name

                return (
                  <tr
                    key={i}
                    className={clsx(
                      'border-b border-slate-700/20 transition-colors group',
                      f.isDirectory ? 'hover:bg-slate-700/20 cursor-pointer' : 'hover:bg-slate-700/10',
                      isDeleting && 'opacity-40'
                    )}
                    onDoubleClick={() => f.isDirectory && loadDir(f.path)}
                  >
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        {f.isDirectory
                          ? <Folder size={14} className="text-brand-teal flex-shrink-0" />
                          : <File size={14} className="text-slate-500 flex-shrink-0" />
                        }
                        {isRenaming ? (
                          <div className="flex items-center gap-1 flex-1">
                            <input
                              autoFocus
                              value={renameValue}
                              onChange={e => setRenameValue(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') confirmRename(f)
                                if (e.key === 'Escape') setRenamingFile(null)
                              }}
                              className="flex-1 bg-navy-900 border border-brand-blue rounded px-2 py-0.5 text-xs text-slate-100 focus:outline-none"
                              onClick={e => e.stopPropagation()}
                            />
                            <button onClick={() => confirmRename(f)} className="p-0.5 text-emerald-400"><Check size={12} /></button>
                            <button onClick={() => setRenamingFile(null)} className="p-0.5 text-slate-500"><X size={12} /></button>
                          </div>
                        ) : (
                          <span className={clsx(
                            'text-xs truncate max-w-[180px]',
                            f.isDirectory ? 'text-slate-200 font-medium' : 'text-slate-300'
                          )}>
                            {f.name}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500 font-mono hidden sm:table-cell">
                      {f.isDirectory ? '—' : formatSize(f.size)}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500 hidden md:table-cell">
                      {new Date(f.modified).toLocaleDateString('ar')}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-600 font-mono hidden lg:table-cell">
                      {f.permissions}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {!f.isDirectory && (
                          <button
                            onClick={() => downloadFile(f)}
                            disabled={!!downloadingFile}
                            className="p-1 text-slate-600 hover:text-brand-blue disabled:opacity-50 transition-colors rounded"
                            title="تنزيل"
                          >
                            {downloadingFile === f.name
                              ? <div className="w-3 h-3 border-2 border-brand-blue border-t-transparent rounded-full animate-spin" />
                              : <Download size={12} />
                            }
                          </button>
                        )}
                        <button
                          onClick={() => { setRenamingFile(f.path); setRenameValue(f.name) }}
                          className="p-1 text-slate-600 hover:text-yellow-400 transition-colors rounded"
                          title="إعادة تسمية"
                        >
                          <Edit3 size={12} />
                        </button>
                        <button
                          onClick={() => deleteFile(f)}
                          disabled={isDeleting}
                          className="p-1 text-slate-600 hover:text-red-400 disabled:opacity-50 transition-colors rounded"
                          title="حذف"
                        >
                          {isDeleting
                            ? <div className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                            : <Trash2 size={12} />
                          }
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Status bar */}
      <div className="px-4 py-1.5 border-t border-slate-700/30 bg-navy-800/50 flex items-center gap-4 text-[10px] text-slate-600 flex-shrink-0">
        <span>{files.length} عنصر</span>
        <span>{files.filter(f => f.isDirectory).length} مجلد</span>
        <span>{files.filter(f => !f.isDirectory).length} ملف</span>
        <span className="mr-auto font-mono text-slate-700">{deviceName} · عبر الوكيل</span>
      </div>
    </div>
  )
}
