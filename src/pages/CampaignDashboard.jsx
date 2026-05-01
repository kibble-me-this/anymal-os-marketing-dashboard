import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MARKETING_API, headers, adminHeaders, HAS_MARKETING_ADMIN_KEY } from '../config'
import ApproveConfirmModal from '../components/ApproveConfirmModal'
import CommandCenterHeader, { WorkspaceTabs } from '../components/dashboard/CommandCenterHeader'
import OpsMetricsRow from '../components/dashboard/OpsMetricsRow'
import NextBestActionPanel from '../components/dashboard/NextBestActionPanel'
import DraftReviewWorkspace from '../components/dashboard/DraftReviewWorkspace'
import CanaryBuilderWorkspace from '../components/dashboard/CanaryBuilderWorkspace'
import PublishedWorkspace from '../components/dashboard/PublishedWorkspace'
import DistributionWorkspace from '../components/dashboard/DistributionWorkspace'
import { buildOpsStats, isAnymalPageAnchor } from '../components/dashboard/dashboardRules'

const REFRESH_INTERVAL = 60
const CHANNELS = [{ id: 'all', label: 'All Channels' }, { id: 'facebook_page', label: 'Facebook' }, { id: 'anymal_linkedin', label: 'Anymal LinkedIn' }, { id: 'personal_linkedin', label: 'Personal LinkedIn' }, { id: 'anymal_x', label: 'Anymal X' }, { id: 'personal_x', label: 'Personal X' }]
const URL_PATTERN = /https?:\/\/world\.anymalos\.com\/[^\s)]*/
const DEFAULT_CANARY_ZIP = '74501'
const CREATIVE_TEMPLATE_ID = 'city_price_launch_v1'

const EMPTY_TARGET_GROUP = { group_name: '', group_url: '', public_private: 'unknown', member_count: '', member_count_band: 'unknown', group_focus: '', post_text: '', utm_content: '', utm_url: '', remove_link_preview: true }
function findAnymalUrl(message) {
  if (!message) return null
  const match = message.match(URL_PATTERN)
  return match ? match[0] : null
}

function extractZipFromCampaign(campaign) {
  if (campaign?.zip) return String(campaign.zip).padStart(5, '0')
  const raw = findAnymalUrl(campaign?.message || campaign?.generated_copy || '')
  if (!raw) return ''
  try {
    const url = new URL(raw)
    const zip = url.searchParams.get('zip')
    return zip ? String(zip).padStart(5, '0') : ''
  } catch {
    return ''
  }
}

function postedUrlForCampaign(campaign) {
  return campaign?.posted_url || campaign?.facebook_post_url || campaign?.post_url || ''
}

function slugForUtm(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
}

function makeUtmContent(zip, groupName) {
  const slug = slugForUtm(groupName)
  return `${zip || DEFAULT_CANARY_ZIP}_${slug || 'group'}`
}

function buildGroupUtmUrl(zip, utmContent) {
  const params = new URLSearchParams({
    utm_source: 'facebook',
    utm_medium: 'group_post',
    utm_campaign: `zip_${zip}_local_price`,
    utm_content: utmContent,
  })
  return `https://world.anymalos.com/price?zip=${zip}&${params.toString()}`
}

async function readErrorDetail(res) {
  let detail = `${res.status}`
  try {
    const body = await res.json()
    if (typeof body?.detail === 'string') detail = body.detail
    else if (body?.detail) detail = JSON.stringify(body.detail)
  } catch { /* no-op */ }
  return detail
}

async function readApiError(res) {
  try {
    const body = await res.json()
    const detail = body?.detail || body
    if (typeof detail === 'string') return { message: detail, detail: { error: detail } }
    return { message: detail?.error || detail?.message || `${res.status}`, detail }
  } catch {
    return { message: `${res.status}`, detail: { error: `${res.status}` } }
  }
}

function creativeMetadataFromAsset(asset) {
  if (!asset) return null
  return {
    template_id: asset.template_id || CREATIVE_TEMPLATE_ID,
    creative_status: asset.status === 'generated' ? 'creative_current' : 'failed',
    current_brand_version: asset.brand_version || '',
    creative_asset_id: asset.creative_asset_id || asset.doc_id || null,
    image_url: asset.image_url || null, thumbnail_url: asset.thumbnail_url || null,
    brand_version: asset.brand_version || null, status: asset.status || null,
    render_engine: asset.render_engine || null, background_model: asset.background_model || null,
    brand_version_stale: null,
  }
}

function resolveCreativeStatus(creativeMetadata, fallback) {
  return fallback || creativeMetadata?.creative_status || 'creative_missing'
}

function resolveZipStatus(campaigns, creativeStatus) {
  if (campaigns.some(campaign => campaign.status === 'needs_review_stale_anchor')) return 'needs_review_stale_anchor'
  if (campaigns.some(campaign => campaign.status === 'needs_creative_review')) return 'needs_creative_review'
  if (creativeStatus === 'creative_missing' || creativeStatus === 'creative_stale_brand_version') return 'needs_creative_review'
  return 'shipped'
}

function campaignCityCounty(campaigns) {
  const firstWithPlace = campaigns.find(campaign => campaign.city || campaign.county || campaign.state) || campaigns[0] || {}
  return { city: firstWithPlace.city || '', county: firstWithPlace.county || '', state: firstWithPlace.state || '' }
}

function buildZipGroups(campaigns, zipCreativeOverrides = {}) {
  const map = new Map()
  campaigns.forEach(campaign => {
    const zip = extractZipFromCampaign(campaign) || 'other'
    if (!map.has(zip)) map.set(zip, [])
    map.get(zip).push(campaign)
  })
  return [...map.entries()]
    .map(([zip, list]) => {
      const override = zipCreativeOverrides[zip] || {}
      const place = campaignCityCounty(list)
      const metadata = override.creativeMetadata || list.find(campaign => campaign.creative_metadata)?.creative_metadata || null
      const creativeStatus = resolveCreativeStatus(metadata, override.creativeStatus || list.find(campaign => campaign.creative_status)?.creative_status)
      const zipStatus = zip === 'other' ? 'unknown' : resolveZipStatus(list, creativeStatus)
      const hasFacebookDraftWithoutCreative = list.some(campaign => campaign.channel === 'facebook_page' && !campaign.creative_metadata)
      return {
        zip,
        campaigns: list,
        creativeMetadata: metadata,
        creativeStatus,
        zipStatus,
        hasFacebookDraftWithoutCreative,
        needsRefresh: Boolean(override.needsRefresh),
        ...place,
      }
    })
    .sort((a, b) => {
      if (a.zip === 'other') return 1
      if (b.zip === 'other') return -1
      return a.zip.localeCompare(b.zip)
    })
}

function mergeCampaigns(...lists) {
  const map = new Map()
  lists.flat().filter(Boolean).forEach(campaign => {
    const id = campaign.campaign_id || campaign.doc_id
    if (id) map.set(id, campaign)
  })
  return [...map.values()]
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
}

export default function CampaignDashboard() {
  const [pending, setPending] = useState([])
  const [published, setPublished] = useState([])
  const [canaryJobs, setCanaryJobs] = useState([])
  const [distributionPlans, setDistributionPlans] = useState([])
  const [activeChannel, setActiveChannel] = useState('all')
  const [workspace, setWorkspace] = useState('drafts')
  const [canaryZip, setCanaryZip] = useState(DEFAULT_CANARY_ZIP)
  const [selectedAnchorId, setSelectedAnchorId] = useState('')
  const [targetGroups, setTargetGroups] = useState([{ ...EMPTY_TARGET_GROUP }])
  const [canarySourceCampaign, setCanarySourceCampaign] = useState(null)
  const [lastRefresh, setLastRefresh] = useState(null)
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL)
  const [actionLoading, setActionLoading] = useState(null)
  const [actionSuccess, setActionSuccess] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [canaryLoading, setCanaryLoading] = useState(false)
  const [canaryCreating, setCanaryCreating] = useState(false)
  const [distributionLoading, setDistributionLoading] = useState(false)
  const [distributionActionLoading, setDistributionActionLoading] = useState(null)
  const [copyLoading, setCopyLoading] = useState(null)
  const [pendingConfirm, setPendingConfirm] = useState(null)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [zipCreativeOverrides, setZipCreativeOverrides] = useState({})
  const [zipLoading, setZipLoading] = useState({})
  const [zipErrors, setZipErrors] = useState({})
  const intervalRef = useRef(null)

  const allCampaigns = useMemo(() => [...pending, ...published], [pending, published])
  const zipOptions = useMemo(() => {
    const zips = new Set([DEFAULT_CANARY_ZIP])
    allCampaigns.forEach(campaign => {
      const zip = extractZipFromCampaign(campaign)
      if (zip) zips.add(zip)
    })
    if (canaryZip) zips.add(canaryZip)
    return [...zips].sort()
  }, [allCampaigns, canaryZip])

  const pageAnchors = useMemo(() => (
    published.filter(campaign => (
      extractZipFromCampaign(campaign) === canaryZip
      && isAnymalPageAnchor(campaign)
    ))
  ), [published, canaryZip])

  const selectedAnchor = useMemo(() => (
    pageAnchors.find(campaign => campaign.campaign_id === selectedAnchorId) || pageAnchors[0] || null
  ), [pageAnchors, selectedAnchorId])

  const pendingZipGroups = useMemo(() => buildZipGroups(pending, zipCreativeOverrides), [pending, zipCreativeOverrides])
  const opsStats = useMemo(() => buildOpsStats({
    pending,
    published,
    canaryJobs,
    pendingZipGroups,
    distributionPlans,
  }), [canaryJobs, distributionPlans, pending, pendingZipGroups, published])

  const workspaceTabs = useMemo(() => ([
    {
      id: 'drafts',
      label: 'Draft review',
      count: pending.length,
      detail: opsStats.staleZipGroups
        ? `${opsStats.staleZipGroups} blocked`
        : opsStats.missingCreativeZipGroups
          ? `${opsStats.missingCreativeZipGroups} need creative`
          : `${opsStats.zipGroups} queues`,
      tone: opsStats.staleZipGroups ? '#ff4444' : opsStats.missingCreativeZipGroups ? '#ffd54f' : '#00e676',
    },
    {
      id: 'canary',
      label: 'Canary builder',
      count: canaryJobs.length,
      detail: opsStats.canaryNeedsReviewCount ? `${opsStats.canaryNeedsReviewCount} needs review` : `${opsStats.activeCanaryJobsCount} active`,
      tone: opsStats.canaryNeedsReviewCount ? '#ffd54f' : '#00e676',
    },
    {
      id: 'distribution',
      label: 'Distribution',
      count: distributionPlans.length,
      detail: opsStats.distributionPlansAwaitingApproval
        ? `${opsStats.distributionPlansAwaitingApproval} pending`
        : `${opsStats.distributionPlansReadyForExecution} ready`,
      tone: opsStats.distributionPlansAwaitingApproval ? '#ffd54f' : '#00e676',
    },
    {
      id: 'published',
      label: 'Published',
      count: published.length,
      detail: `${opsStats.publishedTodayCount} today`,
      tone: '#00e676',
    },
  ]), [canaryJobs.length, distributionPlans.length, opsStats, pending.length, published.length])

  useEffect(() => {
    if (!selectedAnchorId && pageAnchors[0]) {
      setSelectedAnchorId(pageAnchors[0].campaign_id)
      return
    }
    if (selectedAnchorId && !pageAnchors.some(campaign => campaign.campaign_id === selectedAnchorId)) {
      setSelectedAnchorId(pageAnchors[0]?.campaign_id || '')
    }
  }, [pageAnchors, selectedAnchorId])

  const fetchData = useCallback(async () => {
    setLastRefresh(new Date())
    setCountdown(REFRESH_INTERVAL)
    let pendingDrafts = []
    let reviewDrafts = []
    try {
      const channelParam = activeChannel !== 'all' ? `?channel=${activeChannel}` : ''
      const res = await fetch(`${MARKETING_API}/campaigns/pending/by-channel${channelParam}`, { headers })
      if (!res.ok) throw new Error(`${res.status}`)
      const json = await res.json()
      pendingDrafts = json.campaigns || []
    } catch (err) {
      console.error('Failed to fetch pending:', err)
    }
    try {
      const reviewStatuses = ['needs_creative_review', 'needs_review_stale_anchor']
      const responses = await Promise.all(reviewStatuses.map(status => fetch(`${MARKETING_API}/campaigns?status=${status}&limit=50`, { headers })))
      const bodies = await Promise.all(responses.map(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`)
        return res.json()
      }))
      reviewDrafts = bodies.flatMap(body => body.campaigns || [])
      if (activeChannel !== 'all') {
        reviewDrafts = reviewDrafts.filter(campaign => campaign.channel === activeChannel)
      }
    } catch (err) {
      console.error('Failed to fetch review drafts:', err)
    }
    setPending(mergeCampaigns(pendingDrafts, reviewDrafts))
    try {
      const res2 = await fetch(`${MARKETING_API}/campaigns?status=published&limit=50`, { headers })
      if (!res2.ok) throw new Error(`${res2.status}`)
      const json2 = await res2.json()
      setPublished(json2.campaigns || [])
    } catch (err) {
      console.error('Failed to fetch published:', err)
    }
    if (HAS_MARKETING_ADMIN_KEY) {
      setCanaryLoading(true)
      try {
        const res3 = await fetch(`${MARKETING_API}/campaigns/zip-canary/jobs?limit=20`, { headers: adminHeaders })
        if (!res3.ok) throw new Error(`${res3.status}`)
        const json3 = await res3.json()
        setCanaryJobs(json3.jobs || [])
      } catch (err) {
        console.error('Failed to fetch canary jobs:', err)
      } finally {
        setCanaryLoading(false)
      }
      setDistributionLoading(true)
      try {
        const res4 = await fetch(`${MARKETING_API}/distribution-plans`, { headers: adminHeaders })
        if (!res4.ok) throw new Error(`${res4.status}`)
        const json4 = await res4.json()
        setDistributionPlans(json4.distribution_plans || [])
      } catch (err) {
        console.error('Failed to fetch distribution plans:', err)
      } finally {
        setDistributionLoading(false)
      }
    }
  }, [activeChannel])

  useEffect(() => {
    fetchData()
    intervalRef.current = setInterval(() => {
      setCountdown(count => {
        if (count <= 1) {
          fetchData()
          return REFRESH_INTERVAL
        }
        return count - 1
      })
    }, 1000)
    return () => clearInterval(intervalRef.current)
  }, [fetchData])

  const handleRequestApprove = (campaign) => {
    setActionError(null)
    setPendingConfirm(campaign)
  }

  const handleConfirmPublish = async () => {
    if (!pendingConfirm) return
    const campaignId = pendingConfirm.campaign_id
    setConfirmLoading(true)
    setActionLoading(campaignId)
    setActionError(null)
    try {
      const res = await fetch(`${MARKETING_API}/campaigns/${campaignId}/approve`, { method: 'POST', headers })
      if (!res.ok) {
        let detail = `${res.status}`
        try {
          const body = await res.json()
          if (body?.detail) detail = body.detail
        } catch { /* no-op */ }
        throw new Error(detail)
      }
      setActionSuccess(`Published: ${campaignId}`)
      setTimeout(() => setActionSuccess(null), 4000)
      setPendingConfirm(null)
      await fetchData()
    } catch (err) {
      setActionError(`Approve failed: ${err.message}`)
      throw err
    } finally {
      setConfirmLoading(false)
      setActionLoading(null)
    }
  }

  const handleCancelConfirm = () => {
    if (confirmLoading) return
    setPendingConfirm(null)
  }

  const handleReject = async (campaignId) => {
    setActionLoading(campaignId)
    setActionError(null)
    try {
      const res = await fetch(`${MARKETING_API}/campaigns/${campaignId}/reject`, { method: 'POST', headers })
      if (!res.ok) throw new Error(`${res.status}`)
      await fetchData()
    } catch (err) {
      setActionError(`Reject failed: ${err.message}`)
    }
    setActionLoading(null)
  }

  const handlePatched = (campaignId, patch) => {
    setPending(list => list.map(campaign => (
      campaign.campaign_id === campaignId
        ? { ...campaign, ...patch, updated_at: new Date().toISOString() }
        : campaign
    )))
    setActionSuccess(`Saved: ${campaignId}`)
    setTimeout(() => setActionSuccess(null), 4000)
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setActionError(null)
    try {
      const res = await fetch(`${MARKETING_API}/content/run`, { method: 'POST', headers })
      if (!res.ok) throw new Error(`${res.status}`)
      const json = await res.json()
      setActionSuccess(`Generated ${json.drafts_created} drafts`)
      setTimeout(() => setActionSuccess(null), 5000)
      await fetchData()
    } catch (err) {
      setActionError(`Generate failed: ${err.message}`)
    }
    setGenerating(false)
  }

  const callAdminPost = async (path) => {
    const res = await fetch(`${MARKETING_API}${path}`, { method: 'POST', headers: adminHeaders })
    if (!res.ok) {
      const parsed = await readApiError(res)
      const err = new Error(parsed.message)
      err.detail = parsed.detail
      throw err
    }
    return res.json()
  }

  const setZipLoadingPhase = (zip, phase) => {
    setZipLoading(map => ({ ...map, [zip]: phase }))
  }

  const clearZipLoadingPhase = (zip) => {
    setZipLoading(map => {
      const next = { ...map }
      delete next[zip]
      return next
    })
  }

  const handleGenerateCreative = async (zip, { force = false } = {}) => {
    if (!HAS_MARKETING_ADMIN_KEY) {
      setActionError('Creative generation requires VITE_MARKETING_ADMIN_KEY.')
      return
    }
    const phase = force ? 'regenerating' : 'generating'
    setZipLoadingPhase(zip, phase)
    setActionError(null)
    setZipErrors(errors => {
      const next = { ...errors }
      delete next[zip]
      return next
    })
    try {
      const suffix = force ? '&force_regenerate=true' : ''
      const asset = await callAdminPost(`/campaigns/creative/generate?zip=${zip}&template_id=${CREATIVE_TEMPLATE_ID}${suffix}`)
      const creativeMetadata = creativeMetadataFromAsset(asset)
      setZipCreativeOverrides(map => ({
        ...map,
        [zip]: {
          creativeMetadata,
          creativeStatus: creativeMetadata?.creative_status || 'creative_current',
          needsRefresh: true,
        },
      }))
      setActionSuccess(`Creative ready for ZIP ${zip}. Refresh drafts to attach it.`)
      setTimeout(() => setActionSuccess(null), 5000)
    } catch (err) {
      setZipErrors(errors => ({ ...errors, [zip]: err.detail || { error: err.message } }))
      setActionError(`Creative generation failed for ZIP ${zip}: ${err.message}`)
    } finally {
      clearZipLoadingPhase(zip)
    }
  }

  const handleRefreshZipDrafts = async (zip) => {
    if (!HAS_MARKETING_ADMIN_KEY) {
      setActionError('Draft refresh requires VITE_MARKETING_ADMIN_KEY.')
      return
    }
    setZipLoadingPhase(zip, 'refreshing_drafts')
    setActionError(null)
    try {
      const body = await callAdminPost(`/campaigns/zip-local/generate?zip=${zip}`)
      const updatedCount = Array.isArray(body.creative_updated_draft_ids) ? body.creative_updated_draft_ids.length : 0
      if (body.creative_metadata) {
        setZipCreativeOverrides(map => ({
          ...map,
          [zip]: {
            creativeMetadata: body.creative_metadata,
            creativeStatus: body.creative_status || body.creative_metadata.creative_status,
            needsRefresh: false,
          },
        }))
      }
      setActionSuccess(updatedCount > 0 ? `${updatedCount} drafts updated with creative metadata for ZIP ${zip}.` : `Drafts refreshed for ZIP ${zip}.`)
      setTimeout(() => setActionSuccess(null), 5000)
      await fetchData()
    } catch (err) {
      setZipErrors(errors => ({ ...errors, [zip]: err.detail || { error: err.message } }))
      setActionError(`Draft refresh failed for ZIP ${zip}: ${err.message}`)
    } finally {
      clearZipLoadingPhase(zip)
    }
  }

  const handleTargetGroupChange = (index, field, value) => {
    setTargetGroups(groups => groups.map((group, i) => {
      if (i !== index) return group
      const next = { ...group, [field]: value }
      if (field === 'group_name' && !group.utm_content) {
        const content = makeUtmContent(canaryZip, value)
        next.utm_content = content
        next.utm_url = buildGroupUtmUrl(canaryZip, content)
      }
      if (field === 'utm_content') {
        next.utm_url = value ? buildGroupUtmUrl(canaryZip, value) : ''
      }
      return next
    }))
  }

  const handleAddTargetGroup = () => {
    setTargetGroups(groups => [...groups, { ...EMPTY_TARGET_GROUP }])
  }

  const handleRemoveTargetGroup = (index) => {
    setTargetGroups(groups => groups.length <= 1 ? groups : groups.filter((_, i) => i !== index))
  }

  const handleGenerateGroupCopy = async (index) => {
    if (!HAS_MARKETING_ADMIN_KEY) {
      setActionError('Canary copy generation requires VITE_MARKETING_ADMIN_KEY.')
      return
    }
    const group = targetGroups[index]
    const groupName = group.group_name.trim()
    if (!groupName) {
      setActionError('Group name is required before generating copy.')
      return
    }
    const utmContent = group.utm_content || makeUtmContent(canaryZip, groupName)
    setCopyLoading(index)
    setActionError(null)
    try {
      const res = await fetch(`${MARKETING_API}/campaigns/zip-local/group-copy`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          zip: canaryZip,
          group_name: groupName,
          group_focus: group.group_focus || undefined,
          member_count_band: group.member_count_band || undefined,
          utm_content: utmContent,
        }),
      })
      if (!res.ok) throw new Error(await readErrorDetail(res))
      const body = await res.json()
      setTargetGroups(groups => groups.map((item, i) => (
        i === index
          ? {
              ...item,
              post_text: body.post_text || '',
              utm_url: body.utm_url || buildGroupUtmUrl(canaryZip, utmContent),
              utm_content: body.utm_content || utmContent,
              risk_notes: body.risk_notes || [],
              remove_link_preview: true,
            }
          : item
      )))
      setActionSuccess(`Generated group copy: ${groupName}`)
      setTimeout(() => setActionSuccess(null), 4000)
    } catch (err) {
      setActionError(`Group copy failed: ${err.message}`)
    } finally {
      setCopyLoading(null)
    }
  }

  const buildTargetGroupPayloads = () => targetGroups
    .map(group => {
      const groupName = group.group_name.trim()
      if (!groupName || !group.group_url.trim() || !group.post_text.trim()) return null
      const utmContent = group.utm_content || makeUtmContent(canaryZip, groupName)
      const utmUrl = group.utm_url || buildGroupUtmUrl(canaryZip, utmContent)
      return {
        group_name: groupName,
        group_url: group.group_url.trim(),
        public_private: group.public_private || 'unknown',
        member_count: group.member_count || null,
        member_count_band: group.member_count_band || 'unknown',
        group_focus: group.group_focus || null,
        post_text: group.post_text.trim(),
        utm_content: utmContent,
        utm_url: utmUrl,
        remove_link_preview: true,
      }
    })
    .filter(Boolean)

  const handleCreateCanaryJob = async () => {
    if (!HAS_MARKETING_ADMIN_KEY) {
      setActionError('Canary job creation requires VITE_MARKETING_ADMIN_KEY.')
      return
    }
    if (!selectedAnchor) {
      setActionError('Publish the Anymal OS Facebook Page anchor before creating the canary job.')
      return
    }
    const anchorUrl = postedUrlForCampaign(selectedAnchor)
    if (!anchorUrl) {
      setActionError('Selected Page anchor is missing a Facebook post URL.')
      return
    }
    const targetPayloads = buildTargetGroupPayloads()
    if (targetPayloads.length === 0) {
      setActionError('At least one target group needs a URL and approved post text.')
      return
    }
    setCanaryCreating(true)
    setActionError(null)
    try {
      const res = await fetch(`${MARKETING_API}/campaigns/zip-canary/jobs`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          zip: canaryZip,
          city: selectedAnchor.city || '',
          state: selectedAnchor.state || '',
          county: selectedAnchor.county || '',
          campaign_goal: 'zip_subscription',
          status: 'approved_for_execution',
          page_anchor: {
            campaign_id: selectedAnchor.campaign_id,
            facebook_post_url: anchorUrl,
            status: 'published',
          },
          target_groups: targetPayloads,
          cooldown_seconds_between_posts: 120,
        }),
      })
      if (!res.ok) throw new Error(await readErrorDetail(res))
      const job = await res.json()
      setActionSuccess(`Canary job approved: ${job.job_id}`)
      setTimeout(() => setActionSuccess(null), 5000)
      setTargetGroups([{ ...EMPTY_TARGET_GROUP }])
      setCanarySourceCampaign(null)
      await fetchData()
    } catch (err) {
      setActionError(`Canary job failed: ${err.message}`)
    } finally {
      setCanaryCreating(false)
    }
  }

  const handleCancelCanaryJob = async (jobId) => {
    setActionError(null)
    try {
      const res = await fetch(`${MARKETING_API}/campaigns/zip-canary/jobs/${jobId}/cancel`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ cancelled_by: 'carlos' }),
      })
      if (!res.ok) throw new Error(await readErrorDetail(res))
      setActionSuccess(`Cancelled: ${jobId}`)
      setTimeout(() => setActionSuccess(null), 4000)
      await fetchData()
    } catch (err) {
      setActionError(`Cancel failed: ${err.message}`)
    }
  }

  const handleResetCanaryJob = async (jobId) => {
    setActionError(null)
    try {
      const res = await fetch(`${MARKETING_API}/campaigns/zip-canary/jobs/${jobId}/reset`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ reset_by: 'carlos' }),
      })
      if (!res.ok) throw new Error(await readErrorDetail(res))
      setActionSuccess(`Reset: ${jobId}`)
      setTimeout(() => setActionSuccess(null), 4000)
      await fetchData()
    } catch (err) {
      setActionError(`Reset failed: ${err.message}`)
    }
  }

  const handleMarkReviewed = async (job, group) => {
    setActionError(null)
    try {
      const reviewedAt = new Date().toISOString()
      const res = await fetch(`${MARKETING_API}/campaigns/zip-canary/jobs/${job.job_id}/group-result`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          group_id: group.group_id,
          status: 'submitted_unverified',
          posted_as: group.posted_as || 'Carlos Herrera',
          posted_at: group.posted_at || reviewedAt,
          observed_text_excerpt: group.observed_text_excerpt || '',
          facebook_post_url: group.facebook_post_url || null,
          notes: `${group.notes || ''}${group.notes ? ' | ' : ''}Reviewed in dashboard at ${reviewedAt}`,
        }),
      })
      if (!res.ok) throw new Error(await readErrorDetail(res))
      setActionSuccess(`Reviewed: ${group.group_name}`)
      setTimeout(() => setActionSuccess(null), 4000)
      await fetchData()
    } catch (err) {
      setActionError(`Review marker failed: ${err.message}`)
    }
  }

  const replaceDistributionPlan = (updatedPlan) => {
    setDistributionPlans(plans => {
      const exists = plans.some(plan => plan.plan_id === updatedPlan.plan_id)
      const next = exists
        ? plans.map(plan => plan.plan_id === updatedPlan.plan_id ? updatedPlan : plan)
        : [updatedPlan, ...plans]
      return next.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    })
  }

  const handleComposeDistributionPlan = async (campaign) => {
    if (!HAS_MARKETING_ADMIN_KEY) {
      setActionError('Distribution planning requires VITE_MARKETING_ADMIN_KEY.')
      return
    }
    const anchorUrl = postedUrlForCampaign(campaign)
    const pageAnchorPostId = campaign.post_id || campaign.facebook_post_id || ''
    if (!anchorUrl || !pageAnchorPostId) {
      setActionError('Selected Page anchor is missing a Facebook post URL or post ID.')
      return
    }
    setDistributionActionLoading(`compose:${campaign.campaign_id}`)
    setActionError(null)
    try {
      const res = await fetch(`${MARKETING_API}/distribution-plans/compose`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          campaign_id: campaign.campaign_id,
          page_anchor_post_url: anchorUrl,
          page_anchor_post_id: pageAnchorPostId,
        }),
      })
      if (!res.ok) throw new Error(await readErrorDetail(res))
      const plan = await res.json()
      replaceDistributionPlan(plan)
      setWorkspace('distribution')
      setActionSuccess(`Distribution plan composed: ${plan.plan_id}`)
      setTimeout(() => setActionSuccess(null), 5000)
    } catch (err) {
      setActionError(`Distribution plan failed: ${err.message}`)
    } finally {
      setDistributionActionLoading(null)
    }
  }

  const handleUpdateDistributionTarget = async (planId, targetIndex, payload) => {
    if (!HAS_MARKETING_ADMIN_KEY) {
      setActionError('Distribution approval requires VITE_MARKETING_ADMIN_KEY.')
      return
    }
    setDistributionActionLoading(`${planId}:${targetIndex}`)
    setActionError(null)
    try {
      const res = await fetch(`${MARKETING_API}/distribution-plans/${planId}/targets/${targetIndex}`, {
        method: 'PUT',
        headers: adminHeaders,
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(await readErrorDetail(res))
      const plan = await res.json()
      replaceDistributionPlan(plan)
      setActionSuccess(`Distribution target updated: ${targetIndex + 1}`)
      setTimeout(() => setActionSuccess(null), 4000)
    } catch (err) {
      setActionError(`Distribution update failed: ${err.message}`)
      throw err
    } finally {
      setDistributionActionLoading(null)
    }
  }

  const handleBatchApproveTargets = async (planId, targetIndices) => {
    if (!HAS_MARKETING_ADMIN_KEY) {
      setActionError('Batch approval requires VITE_MARKETING_ADMIN_KEY.')
      return
    }
    setDistributionActionLoading(`${planId}:batch`)
    setActionError(null)
    try {
      const res = await fetch(`${MARKETING_API}/distribution-plans/${planId}/batch-approve`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ target_indices: targetIndices }),
      })
      if (!res.ok) throw new Error(await readErrorDetail(res))
      const plan = await res.json()
      replaceDistributionPlan(plan)
      setActionSuccess(`Batch approved ${targetIndices.length} targets`)
      setTimeout(() => setActionSuccess(null), 4000)
    } catch (err) {
      setActionError(`Batch approval failed: ${err.message}`)
      throw err
    } finally {
      setDistributionActionLoading(null)
    }
  }

  const handleMarkDoNotPost = async (plan, target, targetIndex) => {
    if (!HAS_MARKETING_ADMIN_KEY) {
      setActionError('Group target updates require VITE_MARKETING_ADMIN_KEY.')
      return
    }
    if (!window.confirm(`Mark ${target.group_name} as do_not_post?`)) return
    setDistributionActionLoading(`${plan.plan_id}:${targetIndex}`)
    setActionError(null)
    try {
      const res = await fetch(`${MARKETING_API}/group-targets/${target.group_target_id}`, {
        method: 'PUT',
        headers: adminHeaders,
        body: JSON.stringify({
          identity_appropriateness: 'do_not_post',
          operator_notes: `Marked do_not_post from distribution plan ${plan.plan_id}`,
          last_updated_by: 'carlos',
        }),
      })
      if (!res.ok) throw new Error(await readErrorDetail(res))
      await handleUpdateDistributionTarget(plan.plan_id, targetIndex, {
        status: 'rejected_by_operator',
        operator_notes: 'Marked do_not_post in group target registry.',
      })
      setActionSuccess(`Marked do_not_post: ${target.group_name}`)
      setTimeout(() => setActionSuccess(null), 4000)
    } catch (err) {
      setActionError(`Do-not-post update failed: ${err.message}`)
    } finally {
      setDistributionActionLoading(null)
    }
  }

  const handleCopyManual = async (campaign) => {
    const text = campaign.message || campaign.generated_copy || ''
    try {
      await navigator.clipboard.writeText(text)
      setActionSuccess(`Copied: ${campaign.campaign_id}`)
      setTimeout(() => setActionSuccess(null), 4000)
    } catch (err) {
      setActionError(`Copy failed: ${err.message}`)
    }
  }

  const handleIncludeInCanary = (campaign) => {
    const text = campaign.message || campaign.generated_copy || ''
    const zip = extractZipFromCampaign(campaign) || canaryZip
    const rawUrl = findAnymalUrl(text)
    let utmContent = ''
    if (rawUrl) {
      try {
        utmContent = new URL(rawUrl).searchParams.get('utm_content') || ''
      } catch { /* no-op */ }
    }
    setCanaryZip(zip)
    setWorkspace('canary')
    setCanarySourceCampaign(campaign)
    setTargetGroups(groups => {
      const next = groups.length ? [...groups] : [{ ...EMPTY_TARGET_GROUP }]
      next[0] = {
        ...next[0],
        post_text: text,
        utm_content: next[0].utm_content || utmContent,
        utm_url: next[0].utm_url || rawUrl || '',
        remove_link_preview: true,
      }
      return next
    })
    setActionSuccess(`Included in canary builder: ${campaign.campaign_id}`)
    setTimeout(() => setActionSuccess(null), 4000)
  }

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto' }}>
      <CommandCenterHeader lastRefresh={lastRefresh} countdown={countdown} onRefresh={fetchData} onGenerate={handleGenerate} generating={generating} />

      {actionSuccess && <div style={{ background: '#0a2a1a', border: '1px solid #00e676', borderRadius: '6px', padding: '10px 14px', marginBottom: '14px', fontSize: '12px', color: '#00e676' }}>{actionSuccess}</div>}
      {actionError && <div style={{ background: '#2a0a0a', border: '1px solid #ff4444', borderRadius: '6px', padding: '10px 14px', marginBottom: '14px', fontSize: '12px', color: '#ff4444' }}>{actionError}</div>}

      <OpsMetricsRow stats={opsStats} />
      <NextBestActionPanel stats={opsStats} />

      <WorkspaceTabs tabs={workspaceTabs} activeWorkspace={workspace} onSelectWorkspace={setWorkspace} />

      {workspace === 'drafts' && (
        <DraftReviewWorkspace
          channels={CHANNELS}
          activeChannel={activeChannel}
          onChannelChange={setActiveChannel}
          pending={pending}
          pendingZipGroups={pendingZipGroups}
          onRequestApprove={handleRequestApprove}
          onReject={handleReject}
          onPatched={handlePatched}
          onCopyManual={handleCopyManual}
          onIncludeInCanary={handleIncludeInCanary}
          onGenerateCreative={(zip) => handleGenerateCreative(zip)}
          onRegenerateCreative={(zip) => handleGenerateCreative(zip, { force: true })}
          onRefreshDrafts={handleRefreshZipDrafts}
          actionLoading={actionLoading}
          zipLoading={zipLoading}
          zipErrors={zipErrors}
        />
      )}

      {workspace === 'canary' && (
        <CanaryBuilderWorkspace
          zipOptions={zipOptions}
          canaryZip={canaryZip}
          setCanaryZip={setCanaryZip}
          pageAnchors={pageAnchors}
          selectedAnchorId={selectedAnchorId}
          setSelectedAnchorId={setSelectedAnchorId}
          selectedAnchor={selectedAnchor}
          targetGroups={targetGroups}
          onTargetGroupChange={handleTargetGroupChange}
          onAddTargetGroup={handleAddTargetGroup}
          onRemoveTargetGroup={handleRemoveTargetGroup}
          onGenerateGroupCopy={handleGenerateGroupCopy}
          onCreateJob={handleCreateCanaryJob}
          copyLoading={copyLoading}
          canaryCreating={canaryCreating}
          canaryJobs={canaryJobs}
          canaryLoading={canaryLoading}
          onCancelJob={handleCancelCanaryJob}
          onResetJob={handleResetCanaryJob}
          onMarkReviewed={handleMarkReviewed}
          canarySourceCampaign={canarySourceCampaign}
        />
      )}

      {workspace === 'distribution' && (
        <DistributionWorkspace
          pageAnchors={published.filter(isAnymalPageAnchor)}
          distributionPlans={distributionPlans}
          distributionLoading={distributionLoading}
          hasAdminKey={HAS_MARKETING_ADMIN_KEY}
          onComposePlan={handleComposeDistributionPlan}
          onUpdateTarget={handleUpdateDistributionTarget}
          onBatchApprove={handleBatchApproveTargets}
          onMarkDoNotPost={handleMarkDoNotPost}
          actionLoading={distributionActionLoading}
        />
      )}

      {workspace === 'published' && <PublishedWorkspace published={published} />}

      {pendingConfirm && (
        <ApproveConfirmModal campaign={pendingConfirm} onConfirm={handleConfirmPublish} onCancel={handleCancelConfirm} loading={confirmLoading} />
      )}
    </div>
  )
}
