import { useRef, useState } from 'react'
import { Button, Modal, Slider, message } from 'antd'
import { CameraOutlined, UploadOutlined } from '@ant-design/icons'

const MAX_OUTPUT_SIZE = 200 * 1024 // 200KB output limit

function cropAndCompress(file, zoom) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const size = Math.min(img.width, img.height)
      const sx = (img.width - size) / 2
      const sy = (img.height - size) / 2

      const canvas = document.createElement('canvas')
      canvas.width = 256
      canvas.height = 256
      const ctx = canvas.getContext('2d')

      // zoom: 1 = fit, >1 = zoom in
      const drawSize = size / zoom
      const drawSx = sx + (size - drawSize) / 2
      const drawSy = sy + (size - drawSize) / 2

      ctx.drawImage(img, drawSx, drawSy, drawSize, drawSize, 0, 0, 256, 256)

      // try quality from 0.85 down until under MAX_OUTPUT_SIZE
      let quality = 0.85
      let dataUrl = canvas.toDataURL('image/jpeg', quality)
      while (dataUrl.length > MAX_OUTPUT_SIZE * 1.37 && quality > 0.3) {
        quality -= 0.1
        dataUrl = canvas.toDataURL('image/jpeg', quality)
      }
      resolve(dataUrl)
    }
    img.onerror = reject
    img.src = url
  })
}

/**
 * AvatarUploader
 * Props:
 *   current   - current avatar data URL or null
 *   onSave    - async (dataUrl) => void
 *   size      - display size in px (default 64)
 *   username  - for fallback letter avatar
 */
export default function AvatarUploader({ current, onSave, size = 64, username = '?' }) {
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [rawFile, setRawFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef()

  const letter = (username || '?')[0].toUpperCase()

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      message.error('请选择图片文件')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      message.error('图片不能超过 10MB')
      return
    }
    setRawFile(file)
    setZoom(1)
    const reader = new FileReader()
    reader.onload = (ev) => setPreview(ev.target.result)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleSave = async () => {
    if (!rawFile) return
    setSaving(true)
    try {
      const dataUrl = await cropAndCompress(rawFile, zoom)
      await onSave(dataUrl)
      message.success('头像已更新')
      setOpen(false)
      setPreview(null)
      setRawFile(null)
      setZoom(1)
    } catch (err) {
      message.error(err?.message || '上传失败')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setOpen(false)
    setPreview(null)
    setRawFile(null)
    setZoom(1)
  }

  return (
    <>
      {/* Trigger: clickable avatar */}
      <div
        className="avatar-uploader-trigger"
        style={{ width: size, height: size, borderRadius: size * 0.28 }}
        onClick={() => setOpen(true)}
        title="点击更换头像"
      >
        {current ? (
          <img src={current} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
        ) : (
          <div className="avatar-uploader-letter" style={{ fontSize: size * 0.42, borderRadius: 'inherit' }}>
            {letter}
          </div>
        )}
        <div className="avatar-uploader-overlay" style={{ borderRadius: 'inherit' }}>
          <CameraOutlined style={{ fontSize: size * 0.3, color: '#fff' }} />
        </div>
      </div>

      <Modal
        open={open}
        title="更换头像"
        onCancel={handleCancel}
        footer={null}
        width={360}
        centered
      >
        <div className="avatar-modal-body">
          {/* Preview */}
          <div className="avatar-preview-wrap">
            {preview ? (
              <img
                src={preview}
                alt="preview"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  transform: `scale(${zoom})`,
                  transformOrigin: 'center',
                  transition: 'transform 100ms',
                }}
              />
            ) : current ? (
              <img src={current} alt="current" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div className="avatar-preview-placeholder">
                <span style={{ fontSize: 48, fontWeight: 700, color: '#6366f1' }}>{letter}</span>
              </div>
            )}
          </div>

          {/* Zoom slider */}
          {preview && (
            <div style={{ padding: '0 8px', marginBottom: 4 }}>
              <div className="text-xs text-slate-400 mb-1">缩放</div>
              <Slider min={1} max={3} step={0.05} value={zoom} onChange={setZoom} />
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Button
              icon={<UploadOutlined />}
              onClick={() => inputRef.current?.click()}
              style={{ flex: 1 }}
            >
              选择图片
            </Button>
            <Button
              type="primary"
              onClick={handleSave}
              loading={saving}
              disabled={!rawFile}
              style={{ flex: 1 }}
            >
              保存头像
            </Button>
          </div>

          <div className="text-xs text-slate-400 text-center mt-3">
            支持 JPG / PNG / WebP，最大 10MB，将自动裁剪为正方形
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </Modal>
    </>
  )
}
