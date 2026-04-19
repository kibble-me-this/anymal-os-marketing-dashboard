import React from 'react'

const SANS_FONT = "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif"
const MONO_FONT = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"

function truncate(str, n) {
  if (!str) return ''
  return str.length > n ? str.slice(0, n).trimEnd() + '…' : str
}

/**
 * Renders the "replying to" context for a facebook_reply campaign.
 *
 * @param {object} props
 * @param {object} props.campaign - the campaign doc (must have target_* fields)
 * @param {boolean} [props.expanded=false] - if true, show full post/comment text; else truncate
 */
export default function ReplyTargetContext({ campaign, expanded = false }) {
  if (!campaign || campaign.channel !== 'facebook_reply') return null

  const commenterName = campaign.target_commenter_name || '(unknown commenter)'
  const pageName = campaign.target_page_name || '(unknown page)'
  const postText = campaign.target_post_text || ''
  const commentText = campaign.target_comment_text || ''
  const postUrl = campaign.target_post_url || ''
  const pageUrl = campaign.target_page_url || ''
  const commenterUrl = campaign.target_commenter_url || ''

  const postPreview = expanded ? postText : truncate(postText, 160)
  const commentPreview = expanded ? commentText : truncate(commentText, 200)

  return (
    <div
      style={{
        marginTop: '8px',
        padding: '10px 12px',
        borderLeft: '2px solid #1877F2',
        background: 'rgba(24,119,242,0.06)',
        borderRadius: '0 4px 4px 0',
        fontFamily: SANS_FONT,
      }}
    >
      <div
        style={{
          fontSize: '10px',
          letterSpacing: '0.12em',
          color: 'rgba(255,255,255,0.5)',
          textTransform: 'uppercase',
          marginBottom: '6px',
        }}
      >
        Replying to
      </div>

      <div style={{ fontSize: '13px', color: '#ffffff', marginBottom: '4px' }}>
        <strong>
          {commenterUrl ? (
            <a
              href={commenterUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#ffffff', textDecoration: 'none', borderBottom: '1px dotted rgba(255,255,255,0.4)' }}
            >
              {commenterName}
            </a>
          ) : commenterName}
        </strong>
        <span style={{ color: 'rgba(255,255,255,0.5)' }}> on </span>
        {pageUrl ? (
          <a
            href={pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#00e676', textDecoration: 'none' }}
          >
            {pageName}
          </a>
        ) : (
          <span>{pageName}</span>
        )}
      </div>

      {commentText && (
        <div
          style={{
            fontSize: '12px',
            color: 'rgba(255,255,255,0.75)',
            marginBottom: expanded ? '10px' : '6px',
            padding: '6px 8px',
            background: 'rgba(0,0,0,0.25)',
            borderRadius: '3px',
            fontStyle: 'italic',
          }}
        >
          "{commentPreview}"
        </div>
      )}

      {postText && (
        <div
          style={{
            fontSize: '11px',
            color: 'rgba(255,255,255,0.45)',
            marginBottom: '6px',
          }}
        >
          <span style={{ letterSpacing: '0.08em', textTransform: 'uppercase', marginRight: '6px' }}>
            post
          </span>
          {postPreview}
        </div>
      )}

      {postUrl && (
        <div style={{ fontSize: '10px' }}>
          <a
            href={postUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: '#1877F2',
              textDecoration: 'none',
              fontFamily: MONO_FONT,
            }}
          >
            open on facebook ↗
          </a>
        </div>
      )}
    </div>
  )
}
