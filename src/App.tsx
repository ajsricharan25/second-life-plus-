import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Earth,
  Boxes,
  ExternalLink,
  Heart,
  Info,
  Laptop,
  Leaf,
  Lightbulb,
  Menu,
  Microwave,
  Plus,
  Recycle,
  Refrigerator,
  RotateCcw,
  Search,
  ShieldCheck,
  Smartphone,
  Sprout,
  Trash2,
  TriangleAlert,
  Tv,
  Upload,
  WashingMachine,
  Wrench,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import DeviceIllustration from './components/DeviceIllustration'
import WebResearchPanel from './components/WebResearchPanel'
import type { ResearchRequest, ResearchResult } from './lib/research-types'
import { preparePhotoForAI } from './lib/photo'
import { getSafetyWarning } from './lib/estimator'
import { deviceOptions, getDeviceName, validateDeviceInput } from './lib/device'
import type { DeviceId, DeviceInput } from './lib/device'
import type { Currency } from './lib/estimator'
import { readSavedEstimates, writeSavedEstimates } from './lib/storage'
import type { SavedEstimate } from './lib/storage'

type Page = 'estimate' | 'saved' | 'resources'

const deviceIcons: Record<DeviceId, LucideIcon> = {
  'washing-machine': WashingMachine,
  refrigerator: Refrigerator,
  laptop: Laptop,
  smartphone: Smartphone,
  television: Tv,
  microwave: Microwave,
  other: Boxes,
}

const steps = [
  {
    icon: Search,
    title: 'Tell us what’s wrong',
    text: 'A few details about your device and the symptoms you’ve noticed.',
  },
  {
    icon: Wrench,
    title: 'Understand your options',
    text: 'Explore likely causes, sourced costs, and responsible next steps.',
  },
  {
    icon: Sprout,
    title: 'Give it a better ending',
    text: 'Try a safe check, find a repair professional, or recycle responsibly.',
  },
]

function App() {
  const [page, setPage] = useState<Page>('estimate')
  const [menuOpen, setMenuOpen] = useState(false)
  const [appliance, setAppliance] = useState<DeviceId>('washing-machine')
  const [currency, setCurrency] = useState<Currency>('INR')
  const [age, setAge] = useState('4')
  const [replacementCost, setReplacementCost] = useState('')
  const [symptoms, setSymptoms] = useState('')
  const [brandModel, setBrandModel] = useState('')
  const [deviceName, setDeviceName] = useState('')
  const [repairService, setRepairService] = useState('')
  const [photo, setPhoto] = useState<{
    url: string
    name: string
    image: NonNullable<ResearchRequest['image']>
  } | null>(null)
  const [includePhoto, setIncludePhoto] = useState(false)
  const [aiRun, setAiRun] = useState(0)
  const [aiResult, setAiResult] = useState<ResearchResult | null>(null)
  const [aiHistory, setAiHistory] = useState<
    { title: string; question?: string; result: ResearchResult }[]
  >([])
  const [photoError, setPhotoError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [formError, setFormError] = useState('')
  const [assessment, setAssessment] = useState<{
    input: DeviceInput
  } | null>(null)
  const [saved, setSaved] = useState<SavedEstimate[]>(readSavedEstimates)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [location, setLocation] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const photoRequest = useRef(0)
  const howDialog = useRef<HTMLDialogElement>(null)
  const contentHeading = useRef<HTMLHeadingElement>(null)
  const device = deviceOptions.find((item) => item.id === appliance)!
  const safetyWarning = assessment ? getSafetyWarning(assessment.input.symptoms) : null
  const displayDeviceName = appliance === 'other' ? deviceName.trim() || 'Your device' : device.name

  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.url)
    },
    [photo],
  )
  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(''), 5000)
    return () => window.clearTimeout(timeout)
  }, [notice])

  function focusContent() {
    requestAnimationFrame(() => contentHeading.current?.focus({ preventScroll: true }))
  }

  function navigate(next: Page) {
    setPage(next)
    setMenuOpen(false)
    focusContent()
  }

  function newAssessment() {
    setAssessment(null)
    setSavedId(null)
    setSymptoms('')
    setBrandModel('')
    setDeviceName('')
    setRepairService('')
    photoRequest.current++
    setPhoto(null)
    setIncludePhoto(false)
    setAiResult(null)
    setAiHistory([])
    setPhotoError('')
    setFormError('')
    setReplacementCost('')
    setAge(String(device.defaultAge))
    navigate('estimate')
  }

  async function addPhoto(file?: File) {
    if (!file) return
    const request = ++photoRequest.current
    setPhotoError('')
    setIncludePhoto(false)
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setPhotoError('Choose a JPEG, PNG, or WebP image.')
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      setPhotoError('This photo is too large. Choose an image smaller than 8 MB.')
      return
    }
    const url = URL.createObjectURL(file)
    try {
      const image = new Image()
      image.src = url
      await image.decode()
      if (request !== photoRequest.current) {
        URL.revokeObjectURL(url)
        return
      }
      setPhoto({ url, name: file.name, image: preparePhotoForAI(image) })
    } catch {
      URL.revokeObjectURL(url)
      if (request === photoRequest.current)
        setPhotoError('We couldn’t read that image. Try another photo.')
    }
  }

  function assess(details: DeviceInput, withAI = false) {
    try {
      const input = validateDeviceInput(details)
      setAssessment({ input })
      setRepairService(`${getDeviceName(input).toLowerCase()} repair`)
      setAiHistory([])
      setAiRun((previous) => (withAI ? previous + 1 : 0))
      setAiResult(null)
      setFormError('')
      setSavedId(null)
      navigate('estimate')
      requestAnimationFrame(() =>
        document
          .getElementById('assessment-area')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      )
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'Please check your device details and try again.',
      )
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    assess(
      {
        appliance,
        ...(appliance === 'other' ? { deviceName } : {}),
        currency,
        age: Number(age),
        symptoms: symptoms.trim(),
        ...(replacementCost.trim() ? { replacementCost: Number(replacementCost) } : {}),
      },
      true,
    )
  }

  function tryExample() {
    const example = 'The washing machine won’t drain. Water stays in the drum after the cycle ends.'
    setAppliance('washing-machine')
    setAge('4')
    setSymptoms(example)
    setBrandModel('')
    setReplacementCost('')
    photoRequest.current++
    setPhoto(null)
    setPhotoError('')
    setAssessment(null)
    setIncludePhoto(false)
    setAiResult(null)
    setAiHistory([])
    document.getElementById('assessment-area')?.scrollIntoView({ behavior: 'smooth' })
  }

  function saveAssessment() {
    if (!assessment || savedId) return
    const entry = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      input: assessment.input,
      brandModel: brandModel.trim(),
      location: location.trim(),
    }
    const next = [entry, ...saved].slice(0, 30)
    try {
      writeSavedEstimates(next)
      setSaved(next)
      setSavedId(entry.id)
      setNotice('Estimate saved on this device.')
    } catch {
      setNotice('Browser storage is unavailable. Download your estimate to keep a copy.')
    }
  }

  function removeSaved(id: string) {
    const next = saved.filter((item) => item.id !== id)
    try {
      writeSavedEstimates(next)
      setSaved(next)
      if (savedId === id) setSavedId(null)
      setNotice('Saved estimate removed.')
    } catch {
      setNotice('Couldn’t update browser storage. Please try again.')
    }
  }

  function openSaved(entry: SavedEstimate) {
    setBrandModel(entry.brandModel ?? '')
    setLocation(entry.location ?? '')
    setIncludePhoto(false)
    setAppliance(entry.input.appliance)
    setDeviceName(entry.input.deviceName ?? '')
    setCurrency(entry.input.currency)
    setAge(String(entry.input.age))
    setSymptoms(entry.input.symptoms)
    setReplacementCost(entry.input.replacementCost ? String(entry.input.replacementCost) : '')
    photoRequest.current++
    setPhoto(null)
    assess(entry.input)
    setSavedId(entry.id)
  }

  function downloadAssessment() {
    if (!assessment || !aiResult) return
    const reports: { title: string; question?: string; result: ResearchResult }[] = [
      { title: 'Your device assessment', result: aiResult },
      ...aiHistory,
    ]
    const report = [
      'SECOND LIFE — Device repair passport',
      `Device: ${getDeviceName(assessment.input)}`,
      `Brand/model: ${brandModel || 'Not supplied'}`,
      `Symptoms: ${assessment.input.symptoms}`,
      `Location: ${location || 'Not supplied'}`,
      ...reports.flatMap(({ title, question, result }) => [
        '',
        title.toUpperCase(),
        ...(question ? [`Your input: ${question}`] : []),
        `Provider: ${result.provider ?? 'Not specified'}`,
        `Generated: ${result.checkedAt}`,
        result.evidence === 'model-only'
          ? 'AI guidance — no web check. Prices and material quantities remain unverified.'
          : 'Based on API search evidence; prices and faults are not confirmed shop quotes or measurements.',
        `Photo shared for analysis: ${result.photoIncluded ? 'Yes' : 'No'}`,
        result.text,
        ...result.citations.map(
          (citation, index) => `[${index + 1}] ${citation.title}: ${citation.url}`,
        ),
      ]),
    ].join('\n')
    const url = URL.createObjectURL(new Blob([report], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `second-life-${assessment.input.appliance}-passport.txt`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className={`sidebar ${menuOpen ? 'is-open' : ''}`} aria-label="Main navigation">
        <button
          className="brand"
          onClick={() => navigate('estimate')}
          aria-label="Second Life home"
        >
          <span className="brand-mark">
            <RotateCcw size={24} strokeWidth={2.2} />
          </span>
          <span>
            second<span className="brand-light">life</span>
            <span className="brand-dot">.</span>
          </span>
        </button>
        <button
          className="mobile-close icon-button"
          onClick={() => setMenuOpen(false)}
          aria-label="Close navigation"
        >
          <X size={22} />
        </button>
        <div className="nav-label">YOUR WORKSPACE</div>
        <nav>
          <NavButton icon={Plus} active={page === 'estimate'} onClick={newAssessment}>
            New assessment
          </NavButton>
          <NavButton icon={Bookmark} active={page === 'saved'} onClick={() => navigate('saved')}>
            Saved estimates{saved.length > 0 && <span className="nav-count">{saved.length}</span>}
          </NavButton>
          <div className="nav-divider" />
          <NavButton
            icon={CircleHelp}
            onClick={() => {
              howDialog.current?.showModal()
              setMenuOpen(false)
            }}
          >
            How it works
          </NavButton>
          <NavButton
            icon={BookOpen}
            active={page === 'resources'}
            onClick={() => navigate('resources')}
          >
            Repair resources
          </NavButton>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Sprout size={27} strokeWidth={1.5} />
            <p>
              Good things deserve
              <br />a second chance.
            </p>
            <span>A small choice. A lighter footprint.</span>
          </div>
          <div className="sidebar-foot">
            <span className="status-dot" /> A little more circular.
          </div>
        </div>
      </aside>
      {menuOpen && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open navigation"
              aria-expanded={menuOpen}
            >
              <Menu size={22} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>
              {page === 'saved'
                ? 'Saved estimates'
                : page === 'resources'
                  ? 'Repair resources'
                  : 'New assessment'}
            </strong>
          </div>
          <div className="topbar-message">
            <Earth size={16} />
            <span>A better tomorrow starts here</span>
          </div>
        </header>
        <main id="main-content">
          {page === 'estimate' && (
            <>
              <section className="hero">
                <div className="hero-copy">
                  <div className="eyebrow">
                    <span /> SMALL FIXES. BIG POSSIBILITIES.
                  </div>
                  <h1>
                    Broken doesn’t
                    <br />
                    mean <em>finished.</em>
                  </h1>
                  <p>
                    Repair it, reuse it, or recycle it right.
                    <br />
                    Find the best next chapter for your device.
                  </p>
                  <div className="hero-tag">
                    <Leaf size={14} /> Better for your wallet. Lighter on the planet.
                  </div>
                </div>
                <DeviceIllustration />
                <span className="hero-art-note">
                  <Heart size={12} /> A little care goes a long way
                </span>
              </section>

              <section
                id="assessment-area"
                className="assessment-section"
                aria-labelledby="assessment-title"
              >
                <div className="section-heading">
                  <div>
                    <div className="eyebrow text-muted">LET’S MAKE A BETTER CHOICE</div>
                    <h2 id="assessment-title" ref={contentHeading} tabIndex={-1}>
                      {assessment
                        ? 'A clearer picture of what’s next.'
                        : 'What’s going on with your device?'}
                    </h2>
                  </div>
                  {!assessment && (
                    <span className="time-note">
                      <Clock3 size={14} /> About 2 minutes
                    </span>
                  )}
                </div>
                <div className="assessment-grid">
                  <div className="assessment-main">
                    <div className="progress-strip" aria-label="Assessment progress">
                      <span className={assessment ? 'complete' : 'current'}>
                        <b>{assessment ? <Check size={12} /> : '1'}</b> Your device
                      </span>
                      <i />
                      <span className={assessment ? 'current' : ''}>
                        <b>2</b> Your options
                      </span>
                      <i />
                      <span>
                        <b>3</b> Your next step
                      </span>
                    </div>
                    {!assessment ? (
                      <form className="device-form" onSubmit={submit}>
                        <fieldset>
                          <legend>
                            Choose your device <span className="required-dot">*</span>
                          </legend>
                          <div className="device-grid">
                            {deviceOptions.map((item) => {
                              const Icon = deviceIcons[item.id]
                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  aria-pressed={appliance === item.id}
                                  className={`device-option ${appliance === item.id ? 'selected' : ''}`}
                                  onClick={() => {
                                    setAppliance(item.id)
                                    setDeviceName('')
                                    setIncludePhoto(false)
                                    setAge(String(item.defaultAge))
                                    setReplacementCost('')
                                    setSymptoms('')
                                    setBrandModel('')
                                    setFormError('')
                                  }}
                                >
                                  <Icon size={25} strokeWidth={1.5} />
                                  <span>{item.shortName}</span>
                                  {appliance === item.id && (
                                    <span className="selection-check">
                                      <Check size={10} strokeWidth={3} />
                                    </span>
                                  )}
                                </button>
                              )
                            })}
                          </div>
                        </fieldset>
                        {appliance === 'other' && (
                          <div className="field">
                            <label htmlFor="device-name">
                              Device type or name <span className="required-dot">*</span>
                            </label>
                            <input
                              id="device-name"
                              value={deviceName}
                              onChange={(event) => setDeviceName(event.target.value)}
                              placeholder="e.g. Air purifier, printer, coffee machine"
                              required
                              minLength={2}
                              maxLength={80}
                              aria-describedby="device-name-hint"
                            />
                            <p className="field-hint" id="device-name-hint">
                              Name the device, describe its condition, and optionally include a
                              photo. AI will research this device without a preset cost estimate.
                            </p>
                          </div>
                        )}
                        <div className="field">
                          <label htmlFor="brand-model">
                            Brand and model <span className="optional">Optional</span>
                          </label>
                          <input
                            id="brand-model"
                            placeholder={
                              appliance === 'other'
                                ? 'e.g. Brand and model from the device label'
                                : 'e.g. Bosch Serie 4 WAN24209IN'
                            }
                            value={brandModel}
                            onChange={(event) => setBrandModel(event.target.value)}
                            maxLength={120}
                            aria-describedby="model-hint"
                          />
                          <p className="field-hint" id="model-hint">
                            An exact model helps find relevant parts and published repair prices.
                          </p>
                        </div>
                        <div className="field">
                          <label htmlFor="photo">
                            Add a photo <span className="optional">Optional</span>
                          </label>
                          <input
                            ref={fileInput}
                            id="photo"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            hidden
                            onChange={(event) => {
                              void addPhoto(event.target.files?.[0])
                              event.target.value = ''
                            }}
                            aria-describedby="photo-note photo-error"
                          />
                          <div
                            className={`drop-zone ${dragging ? 'dragging' : ''} ${photo ? 'has-photo' : ''}`}
                            onDragOver={(event) => {
                              event.preventDefault()
                              setDragging(true)
                            }}
                            onDragLeave={() => setDragging(false)}
                            onDrop={(event) => {
                              event.preventDefault()
                              setDragging(false)
                              void addPhoto(event.dataTransfer.files[0])
                            }}
                          >
                            {photo ? (
                              <>
                                <img src={photo.url} alt="Your appliance reference photo" />
                                <div className="photo-details">
                                  <strong>{photo.name}</strong>
                                  <span>
                                    <CheckCircle2 size={13} /> Photo added for reference
                                  </span>
                                  <button
                                    type="button"
                                    className="text-button"
                                    onClick={() => fileInput.current?.click()}
                                  >
                                    Choose another photo
                                  </button>
                                </div>
                                <button
                                  className="icon-button"
                                  type="button"
                                  aria-label="Remove photo"
                                  onClick={() => {
                                    photoRequest.current++
                                    setPhoto(null)
                                    setPhotoError('')
                                  }}
                                >
                                  <X size={18} />
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className="upload-button"
                                onClick={() => fileInput.current?.click()}
                              >
                                <span className="upload-icon">
                                  <Upload size={22} strokeWidth={1.5} />
                                </span>
                                <strong>
                                  <span>Click to add</span> or drag and drop a photo
                                </strong>
                                <small>JPEG, PNG or WebP · up to 8 MB</small>
                              </button>
                            )}
                          </div>
                          <p className="field-hint" id="photo-note">
                            <ShieldCheck size={13} /> Your photo stays here unless you choose to
                            include it in AI analysis.
                          </p>
                          {photo && (
                            <label className="photo-consent">
                              <input
                                type="checkbox"
                                checked={includePhoto}
                                onChange={(event) => setIncludePhoto(event.target.checked)}
                              />
                              Include this photo in AI analysis. A resized copy will be sent to the
                              configured provider (OpenAI, Google, or Groq).
                            </label>
                          )}
                          {photoError && (
                            <p className="field-error" id="photo-error" role="alert">
                              {photoError}
                            </p>
                          )}
                        </div>
                        <div className="field">
                          <label htmlFor="symptoms">
                            {appliance === 'other'
                              ? 'Describe its condition and problem'
                              : 'What seems to be the problem?'}{' '}
                            <span className="required-dot">*</span>
                          </label>
                          <textarea
                            id="symptoms"
                            placeholder={
                              appliance === 'other'
                                ? 'What does it do now? Include damage, error codes, sounds, when it started, and what you have tried…'
                                : 'e.g. It turns on, but water stays in the drum after a wash…'
                            }
                            value={symptoms}
                            onChange={(event) => setSymptoms(event.target.value)}
                            required
                            minLength={8}
                            maxLength={2000}
                            rows={3}
                            aria-describedby="symptoms-hint"
                          />
                          <div className="symptom-suggestions" id="symptoms-hint">
                            <span>Try a symptom:</span>
                            {device.symptomSuggestions.slice(0, 3).map((text) => (
                              <button key={text} type="button" onClick={() => setSymptoms(text)}>
                                {text}
                                <Plus size={11} />
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="form-row">
                          <div className="field">
                            <label htmlFor="age">How old is it?</label>
                            <div className="input-unit">
                              <input
                                id="age"
                                type="number"
                                min="0"
                                max="50"
                                step="0.5"
                                required
                                value={age}
                                onChange={(event) => setAge(event.target.value)}
                              />
                              <span>years</span>
                            </div>
                          </div>
                          <div className="field">
                            <label htmlFor="replacement">
                              Replacement budget{' '}
                              <span className="optional">Whole device · Optional</span>
                            </label>
                            <div className="input-unit currency-input">
                              <span>{currency === 'INR' ? '₹' : '$'}</span>
                              <input
                                id="replacement"
                                type="number"
                                min="1"
                                max="10000000"
                                placeholder="Price if known"
                                value={replacementCost}
                                onChange={(event) => setReplacementCost(event.target.value)}
                                aria-describedby="budget-hint"
                              />
                            </div>
                          </div>
                        </div>
                        <p id="budget-hint" className="budget-note">
                          Enter the current price of an equivalent new device, not the faulty part.{' '}
                          Leave blank for AI to look for a sourced replacement price.
                        </p>
                        <div className="field">
                          <label htmlFor="initial-location">
                            City or postcode <span className="optional">Optional</span>
                          </label>
                          <input
                            id="initial-location"
                            value={location}
                            onChange={(event) => setLocation(event.target.value)}
                            maxLength={120}
                            placeholder="e.g. Bengaluru, 560001"
                            aria-describedby="initial-location-hint"
                          />
                          <p className="field-hint" id="initial-location-hint">
                            Helps AI find relevant regional prices and nearby repair searches.
                          </p>
                        </div>
                        <div className="form-footer">
                          <div className="currency-select">
                            <label htmlFor="currency">Estimate in</label>
                            <div>
                              <select
                                id="currency"
                                value={currency}
                                onChange={(event) => {
                                  setCurrency(event.target.value as Currency)
                                  setReplacementCost('')
                                }}
                              >
                                <option value="INR">INR (₹)</option>
                                <option value="USD">USD ($)</option>
                              </select>
                              <ChevronDown size={13} />
                            </div>
                          </div>
                          <button className="button button-primary" type="submit" data-mode="ai">
                            Analyze with AI <ArrowRight size={17} />
                          </button>
                        </div>
                        {formError && (
                          <p className="field-error" role="alert">
                            {formError}
                          </p>
                        )}
                        <p className="estimate-disclaimer">
                          <Info size={13} /> Analyze with AI sends your device details and symptoms
                          to the configured AI provider. Web research may send a text search query
                          to Tavily; photos go only to the AI provider when you opt in. AI can
                          suggest likely causes, but cannot measure internal faults.
                        </p>
                      </form>
                    ) : (
                      <div className="results">
                        <div className="result-topline">
                          <span className="recommendation-tag inspect">
                            <BookOpen size={14} /> YOUR AI DEVICE REPORT
                          </span>
                          <button
                            className="text-button"
                            onClick={() => {
                              setAssessment(null)
                              focusContent()
                            }}
                          >
                            <ArrowLeft size={13} /> Edit details
                          </button>
                        </div>
                        <div className="result-device">
                          <span className="result-device-icon">
                            {(() => {
                              const Icon = deviceIcons[assessment.input.appliance]
                              return <Icon size={29} strokeWidth={1.5} />
                            })()}
                          </span>
                          <div>
                            <h3>{getDeviceName(assessment.input)}</h3>
                            <span>
                              {assessment.input.age} years old · {assessment.input.currency}{' '}
                              estimates
                            </span>
                          </div>
                          {photo && (
                            <img className="result-photo" src={photo.url} alt="Your device" />
                          )}
                        </div>
                        {safetyWarning && (
                          <div className="safety-message" role="alert">
                            <TriangleAlert size={19} />
                            <div>
                              <strong>Put safety first</strong>
                              <p>{safetyWarning}</p>
                            </div>
                          </div>
                        )}
                        <WebResearchPanel
                          autoStartToken={aiRun}
                          onAutoStart={() => setAiRun(0)}
                          onResult={setAiResult}
                          onHistory={setAiHistory}
                          request={{
                            task: 'assessment',
                            appliance: assessment.input.appliance,
                            ...(assessment.input.deviceName
                              ? { deviceName: assessment.input.deviceName }
                              : {}),
                            age: assessment.input.age,
                            symptoms: assessment.input.symptoms,
                            currency: assessment.input.currency,
                            brandModel: brandModel.trim(),
                            location,
                            service: repairService,
                            ...(assessment.input.replacementCost
                              ? { replacementCost: assessment.input.replacementCost }
                              : {}),
                            ...(includePhoto && photo ? { image: photo.image } : {}),
                          }}
                        />
                        <div className="result-actions">
                          <button
                            className="button button-primary"
                            onClick={saveAssessment}
                            disabled={Boolean(savedId)}
                          >
                            {savedId ? <Check size={16} /> : <Bookmark size={16} />}
                            {savedId ? 'Estimate saved' : 'Save estimate'}
                          </button>
                          <button
                            className="button button-secondary"
                            onClick={downloadAssessment}
                            disabled={!aiResult}
                          >
                            <ArrowDownToLine size={16} /> Download
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <aside className="assessment-aside" aria-label="Assessment help">
                    {assessment ? (
                      <div className="promise-card">
                        <span className="promise-icon">
                          <Sprout size={30} />
                        </span>
                        <div className="eyebrow">YOUR DEVICE, ONE REPORT</div>
                        <h3>Clarity before a decision.</h3>
                        <p>
                          Your assessment connects the likely cause, remedies, published costs,
                          nearby listings and recycling evidence.
                        </p>
                        <Feature
                          icon={CircleHelp}
                          title="Ask a follow-up"
                          text="Add a new observation and ask AI what changes."
                        />
                        <Feature
                          icon={Wrench}
                          title="Review a quote"
                          text="Ask AI to explain a repairer's charges and missing details."
                        />
                        <Feature
                          icon={BookOpen}
                          title="Build a repair passport"
                          text="Create a tailored shop brief and download your conversation."
                        />
                      </div>
                    ) : (
                      <>
                        <div className="promise-card">
                          <span className="promise-icon">
                            <Sprout size={30} strokeWidth={1.4} />
                          </span>
                          <div className="eyebrow">A SECOND CHANCE STARTS HERE</div>
                          <h3>
                            Sometimes, all it needs
                            <br />
                            is a little fixing.
                          </h3>
                          <p>You don’t need to be an expert to make a more informed choice.</p>
                          <div className="promise-divider" />
                          <Feature
                            icon={Wrench}
                            title="Understand the problem"
                            text="Find a possible cause from the symptoms you describe."
                          />
                          <Feature
                            icon={Recycle}
                            title="Compare your options"
                            text="Research repair and replacement prices with source links."
                          />
                          <Feature
                            icon={Heart}
                            title="Choose with confidence"
                            text="Get practical guidance for your next step."
                          />
                          <span className="promise-leaf">
                            <Leaf size={90} strokeWidth={0.7} />
                          </span>
                        </div>
                        <button className="example-card" onClick={tryExample}>
                          <span className="example-icon">
                            <Lightbulb size={21} />
                          </span>
                          <span>
                            <strong>Just looking around?</strong>
                            <small>Explore a washing machine example</small>
                          </span>
                          <ArrowUpRight size={18} />
                        </button>
                      </>
                    )}
                    <div className="privacy-note">
                      <ShieldCheck size={20} strokeWidth={1.5} />
                      <p>
                        <strong>Your device. Your data.</strong>Photos are shared only when you
                        include them in AI analysis. Saved device details stay in this browser.
                      </p>
                    </div>
                  </aside>
                </div>
              </section>
              <section className="how-strip" aria-labelledby="how-title">
                <div className="how-strip-title">
                  <span className="eyebrow">LESS GUESSWORK, MORE GOOD</span>
                  <h2 id="how-title">
                    A small step toward
                    <br />a longer life.
                  </h2>
                </div>
                {steps.map((step, index) => (
                  <div className="how-step" key={step.title}>
                    <div>
                      <step.icon size={19} strokeWidth={1.5} />
                      <span>0{index + 1}</span>
                    </div>
                    <h3>{step.title}</h3>
                    <p>{step.text}</p>
                  </div>
                ))}
              </section>
            </>
          )}

          {page === 'saved' && (
            <section className="secondary-page">
              <div className="eyebrow text-muted">PICK UP WHERE YOU LEFT OFF</div>
              <div className="page-heading">
                <div>
                  <h1 ref={contentHeading} tabIndex={-1}>
                    Your saved estimates<span>.</span>
                  </h1>
                  <p>Keep your options close. These estimates are stored only in this browser.</p>
                </div>
                <button className="button button-primary" onClick={newAssessment}>
                  <Plus size={16} /> New assessment
                </button>
              </div>
              {saved.length === 0 ? (
                <div className="empty-state">
                  <span>
                    <Bookmark size={31} strokeWidth={1.5} />
                  </span>
                  <h2>A little space for your next steps.</h2>
                  <p>
                    Save an estimate after exploring your device’s options.
                    <br />
                    You’ll find it right here when you need it.
                  </p>
                  <button className="button button-primary" onClick={newAssessment}>
                    Assess a device <ArrowRight size={16} />
                  </button>
                </div>
              ) : (
                <div className="saved-list">
                  {saved.map((entry) => {
                    const name = getDeviceName(entry.input)
                    const Icon = deviceIcons[entry.input.appliance]
                    return (
                      <article className="saved-card" key={entry.id}>
                        <span className="saved-device-icon">
                          <Icon size={26} strokeWidth={1.5} />
                        </span>
                        <div>
                          <span className="saved-date">
                            {new Date(entry.createdAt).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </span>
                          <h2>{name}</h2>
                          <p>{entry.input.symptoms}</p>
                          <span className="saved-price">
                            Device details saved · Run AI for a fresh assessment
                          </span>
                        </div>
                        <div className="saved-card-actions">
                          <button
                            className="button button-secondary"
                            onClick={() => openSaved(entry)}
                          >
                            View estimate <ArrowRight size={15} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={`Delete ${name} estimate`}
                            onClick={() => removeSaved(entry.id)}
                          >
                            <Trash2 size={17} />
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
              <p className="storage-note">
                <Info size={14} /> Clearing browser data removes saved estimates. Download a copy to
                keep it elsewhere. Up to 30 estimates are stored.
              </p>
            </section>
          )}

          {page === 'resources' && (
            <section className="secondary-page">
              <div className="eyebrow text-muted">A LITTLE KNOW-HOW GOES A LONG WAY</div>
              <div className="page-heading">
                <div>
                  <h1 ref={contentHeading} tabIndex={-1}>
                    Keep good things going<span>.</span>
                  </h1>
                  <p>Useful starting points for repair, maintenance, and responsible recycling.</p>
                </div>
                <span className="resource-heading-icon">
                  <BookOpen size={37} strokeWidth={1.3} />
                </span>
              </div>
              <div className="resources-grid">
                <ResourceCard
                  icon={Wrench}
                  title="Find a repair guide"
                  text="Search iFixit’s community guides for your exact make and model. Check the difficulty, tools, and safety notes before you begin."
                  href="https://www.ifixit.com/Guide"
                  link="Explore iFixit guides"
                />
                <ResourceCard
                  icon={BookOpen}
                  title="Start with the manual"
                  text="Your manufacturer’s support site has model-specific troubleshooting and warranty information. Keep your model number handy."
                  href={`https://www.google.com/search?q=${encodeURIComponent(`${displayDeviceName} manufacturer official support manual`)}`}
                  link="Search for official support"
                />
                <ResourceCard
                  icon={Recycle}
                  title="Recycle responsibly"
                  text="Find the e-waste guidance and authorized recycler information from India’s Central Pollution Control Board."
                  href="https://cpcb.nic.in/e-waste/"
                  link="Read CPCB e-waste guidance"
                />
                <ResourceCard
                  icon={Earth}
                  title="Explore U.S. recycling options"
                  text="The U.S. Environmental Protection Agency explains donation, electronics recycling, and how to choose a responsible destination."
                  href="https://www.epa.gov/recycle/electronics-donation-and-recycling"
                  link="Read EPA recycling guidance"
                />
              </div>
              <div className="resource-safety">
                <ShieldCheck size={25} />
                <div>
                  <h2>Know when to call a professional.</h2>
                  <p>
                    Smoke, sparks, a swollen battery, exposed wiring, or a burning smell need expert
                    attention. Stop using the device. Don’t open batteries, microwave cabinets, or
                    refrigeration systems. For active fire or immediate danger, move away and
                    contact emergency services.
                  </p>
                </div>
              </div>
              <div className="data-note">
                <h2>How our estimates work</h2>
                <p>
                  Second Life sends your details to the selected AI provider. The report uses API
                  responses and available search evidence. It adds no preset faults, repair prices,
                  material weights or assumed recycling payouts. A photo cannot establish the mass
                  or condition of internal materials.
                </p>
                <p>
                  AI uses your symptoms, optional photo, and available sources to explain likely
                  causes, checks, remedies, and repair-versus-replace choices. It cannot measure
                  internal faults or guarantee a diagnosis. Photos are never included in saved
                  estimates.
                </p>
                <p>
                  Web research looks for published guidance and prices for your model, symptoms,
                  repair service, and area. Web-checked answers include source links and a checked
                  date. Groq can also provide clearly labelled guidance without a web check; current
                  prices remain unverified in that mode. Published prices may have conditions;
                  confirm the final charge with a repairer. Google Maps searches use the suggested
                  component or service suggested by the AI.
                </p>
              </div>
            </section>
          )}

          <footer className="page-footer">
            <span>
              <RotateCcw size={15} /> Thoughtfully repaired. Responsibly recycled.
            </span>
            <button
              className="text-button"
              onClick={() => {
                howDialog.current?.showModal()
              }}
            >
              A little about Second Life <ArrowUpRight size={13} />
            </button>
          </footer>
        </main>
      </div>
      <dialog
        ref={howDialog}
        className="how-dialog"
        onClick={(event) => {
          if (event.target === event.currentTarget) howDialog.current?.close()
        }}
        aria-labelledby="dialog-title"
      >
        <div className="dialog-content">
          <button
            className="icon-button dialog-close"
            aria-label="Close how it works"
            onClick={() => howDialog.current?.close()}
          >
            <X size={20} />
          </button>
          <span className="dialog-icon">
            <RotateCcw size={26} />
          </span>
          <div className="eyebrow">A BETTER NEXT CHAPTER</div>
          <h2 id="dialog-title">
            Repair or recycle,
            <br />
            with a little more clarity.
          </h2>
          <p>Second Life helps you weigh your options before giving up on a device.</p>
          <div className="dialog-steps">
            {steps.map((step) => (
              <Feature key={step.title} icon={step.icon} title={step.title} text={step.text} />
            ))}
          </div>
          <div className="dialog-note">
            <Info size={18} />
            <p>
              Analyze with AI uses OpenAI, Gemini, or Groq, your symptoms, and available sources.
              Groq guidance without a web check is labelled, with current prices left unverified.
              Photos are analyzed only when you choose to include them. No preset prices or material
              weights are substituted. Shop search opens Google Maps for the selected service.
              Published component prices are kept separate from complete repair costs.
            </p>
          </div>
          <button
            className="button button-primary"
            onClick={() => {
              howDialog.current?.close()
              navigate('estimate')
            }}
          >
            Let’s get started <ArrowRight size={16} />
          </button>
        </div>
      </dialog>
      <div className={`toast ${notice ? 'visible' : ''}`} role="status" aria-live="polite">
        {notice && (
          <>
            <Info size={17} />
            {notice}
            <button aria-label="Dismiss notification" onClick={() => setNotice('')}>
              <X size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function NavButton({
  icon: Icon,
  active,
  children,
  onClick,
}: {
  icon: LucideIcon
  active?: boolean
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button
      className={`nav-button ${active ? 'active' : ''}`}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
    >
      <Icon size={18} strokeWidth={1.7} />
      <span>{children}</span>
    </button>
  )
}

function Feature({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="feature">
      <span>
        <Icon size={19} strokeWidth={1.6} />
      </span>
      <div>
        <h4>{title}</h4>
        <p>{text}</p>
      </div>
    </div>
  )
}

function ResourceCard({
  icon: Icon,
  title,
  text,
  href,
  link,
}: {
  icon: LucideIcon
  title: string
  text: string
  href: string
  link: string
}) {
  return (
    <article className="resource-card">
      <span>
        <Icon size={25} strokeWidth={1.5} />
      </span>
      <h2>{title}</h2>
      <p>{text}</p>
      <a href={href} target="_blank" rel="noreferrer">
        {link}
        <ExternalLink size={15} />
      </a>
    </article>
  )
}

export default App
