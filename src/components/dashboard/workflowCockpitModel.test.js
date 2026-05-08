import { describe, expect, it } from 'vitest'
import {
  buildCarlosTask,
  buildEvidenceRows,
  nextClickCopy,
  riskLabelForStep,
  sourceFreshnessState,
} from './workflowCockpitModel'

const baseRun = {
  run_id: 'workflowrun_test',
  workflow_type: 'zip_price_activation',
  workflow_title: 'Announce 67501 price intelligence is live',
  status: 'waiting_for_carlos',
  current_step_id: 'click_post',
  linked_entities: { zip: '67501' },
  steps: [
    { step_id: 'stage_personal_share', title: 'Stage personal account share', kind: 'browser_stage_only', status: 'completed', result: {
      share_outcomes: [
        {
          share_outcome_id: 'share_1',
          group_name: 'USA Cattle',
          status: 'approved_for_attended_share',
        },
      ],
    } },
    { step_id: 'click_post', title: 'Carlos clicks Post after review', kind: 'carlos_final_action', status: 'pending' },
    { step_id: 'update_outcome_ledger', title: 'Update share outcome ledger', kind: 'backend_safe', status: 'pending' },
  ],
}

describe('workflow cockpit model', () => {
  it('builds six honest evidence fields from campaign, share, and ledger state', () => {
    const run = {
      ...baseRun,
      steps: [
        ...baseRun.steps.slice(0, 2),
        {
          step_id: 'update_outcome_ledger',
          title: 'Update share outcome ledger',
          kind: 'backend_safe',
          status: 'completed',
          result: {
            observed_status: 'submitted_visible_or_feed',
            reconciled_count: 1,
            skipped_count: 0,
            share_outcomes: [{ share_outcome_id: 'share_1', reconciliation_status: 'updated_from_click_post' }],
            learning_loop_input: { source_step_id: 'update_outcome_ledger' },
          },
        },
      ],
    }
    const rows = buildEvidenceRows({
      run,
      campaigns: [{
        campaign_id: 'step37_67501_facebook_page_v1',
        zip: '67501',
        channel: 'facebook_page',
        status: 'published',
        posted_url: 'https://facebook.com/post/1',
        post_id: 'post_1',
      }],
      shareOutcomes: [{
        share_outcome_id: 'share_1',
        status: 'submitted_visible_or_feed',
        facebook_share_url: 'https://facebook.com/share/1',
      }],
    })

    expect(rows.map(row => row.id)).toEqual([
      'page_post.published',
      'posted_url',
      'post_id',
      'personal_share.staged',
      'personal_share.posted',
      'outcome_ledger.updated',
    ])
    expect(rows.every(row => row.state === 'yes')).toBe(true)
  })

  it('surfaces unknown when backend data is not exposed yet', () => {
    const rows = buildEvidenceRows({ run: baseRun, campaigns: [], shareOutcomes: [] })

    expect(rows.find(row => row.id === 'page_post.published').state).toBe('unknown')
    expect(rows.find(row => row.id === 'personal_share.posted').state).toBe('no')
    expect(rows.find(row => row.id === 'outcome_ledger.updated').state).toBe('unknown')
  })

  it('moves click_post from staging request to approval when share outcome is staged', () => {
    const initialRows = buildEvidenceRows({ run: baseRun, campaigns: [], shareOutcomes: [] })
    const initialTask = buildCarlosTask(baseRun, initialRows, [])

    expect(initialTask.actionType).toBe('request_staging')
    expect(initialTask.title).toBe('Request browser staging before Post')
    expect(initialTask.risk).toBe('staging')
    expect(initialTask.shareOutcomeId).toBe('share_1')
    expect(initialTask.stepNumber).toBe(2)
    expect(initialTask.stepCount).toBe(3)

    const stagedShareOutcomes = [{ share_outcome_id: 'share_1', status: 'staged_for_operator_review' }]
    const stagedRows = buildEvidenceRows({ run: baseRun, campaigns: [], shareOutcomes: stagedShareOutcomes })
    const stagedTask = buildCarlosTask(baseRun, stagedRows, stagedShareOutcomes)

    expect(stagedTask.actionType).toBe('decision')
    expect(stagedTask.title).toBe('Carlos reviews staged composer and clicks Post')
    expect(stagedTask.risk).toBe('live_external')
    expect(stagedTask.disabledReason).toBe('')
    expect(nextClickCopy(stagedTask).willNot).toContain('Click Post for Carlos.')
  })

  it('switches click_post into a refresh state after browser staging is requested', () => {
    const requestedShareOutcomes = [{
      share_outcome_id: 'share_1',
      group_name: 'USA Cattle',
      status: 'staging_requested',
    }]
    const rows = buildEvidenceRows({ run: baseRun, campaigns: [], shareOutcomes: requestedShareOutcomes })
    const task = buildCarlosTask(baseRun, rows, requestedShareOutcomes)

    expect(rows.find(row => row.id === 'personal_share.staged').state).toBe('no')
    expect(rows.find(row => row.id === 'personal_share.staged').detail).toContain('1 staging requested')
    expect(task.actionType).toBe('refresh')
    expect(task.title).toBe('Waiting for browser staging runner')
    expect(task.risk).toBe('staging')
    expect(task.primaryLabel).toBe('Refresh staging status')
    expect(task.handoffSummary).toContain('Wait for the desktop runner')
    expect(nextClickCopy(task).willNot).toContain('Request another share handoff.')
  })

  it('classifies risk labels and source freshness explicitly', () => {
    expect(riskLabelForStep({ step_id: 'verify_price_intelligence_live', kind: 'backend_safe' })).toBe('safe_backend')
    expect(riskLabelForStep({ step_id: 'stage_personal_share', kind: 'browser_stage_only' })).toBe('staging')
    expect(riskLabelForStep({ step_id: 'click_post', kind: 'carlos_final_action' })).toBe('live_external')

    const source = sourceFreshnessState({
      lastLoadedAt: '2026-05-08T12:00:00Z',
      run: baseRun,
      campaigns: [],
      shareOutcomes: [],
    })

    expect(source.browserTasksSource).toBe('not integrated in V1')
    expect(source.runDiscoverySource).toBe('exact run id required')
    expect(source.historicalAccessSource).toBe('exact run id required')
    expect(source.pageFreshnessLabel).toBe('unknown')
  })
})
