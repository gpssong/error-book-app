/**
 * UpgradeModal - 付费升级弹窗
 *
 * 展示免费版额度限制 + Pro/Family 套餐对比，支持手动充值流程。
 * 由 PAYWALL_EVENT 触发，在 AppContent 层全局渲染。
 */
import React, { useState, useCallback } from 'react'
import api, { PAYWALL_EVENT, type PaywallError, type SubscriptionInfo } from '@/stores/api'
import payQrCode from '@/assets/wechat-pay-qrcode.jpg?url'
import contactQrCode from '@/assets/wechat-contact-qrcode.jpg?url'

// ─── 套餐定义 ──────────────────────────────────────────────────────────────────
type PlanKey = 'free' | 'pro' | 'family'

interface PlanDef {
  key: PlanKey
  label: string
  monthlyPrice: number
  yearlyPrice: number
  tag?: string
  color: string
  gradient: string
  features: string[]
  highlight?: boolean
}

const PLANS: PlanDef[] = [
  {
    key: 'free',
    label: '免费版',
    monthlyPrice: 0,
    yearlyPrice: 0,
    color: '#64748B',
    gradient: 'linear-gradient(135deg, #64748B, #94A3B8)',
    features: [
      '每日 10 次 OCR 识别',
      '每日 3 次 AI 讲解',
      '每日 3 组同类题',
      '1 个孩子档案',
    ],
  },
  {
    key: 'pro',
    label: 'Pro 个人版',
    monthlyPrice: 18,
    yearlyPrice: 148,
    tag: '推荐',
    color: '#2563EB',
    gradient: 'linear-gradient(135deg, #2563EB, #7C3AED)',
    features: [
      '无限 OCR 识别',
      '无限 AI 讲解',
      '无限同类题生成',
      '每月 30 张打印',
      '手写批注高级工具',
      '1 个孩子档案',
    ],
    highlight: true,
  },
  {
    key: 'family',
    label: 'Family 家庭版',
    monthlyPrice: 28,
    yearlyPrice: 238,
    color: '#DC2626',
    gradient: 'linear-gradient(135deg, #DC2626, #F59E0B)',
    features: [
      'Pro 全部功能',
      '最多 5 个孩子档案',
      '全家共享订阅',
      '无打印限制',
    ],
  },
]

interface UpgradeModalProps {
  onClose: () => void
  initialAction?: PaywallError['action'] | null
}

// ─── 充值成功状态 ──────────────────────────────────────────────────────────────
function UpgradeSuccess({ plan, onClose }: { plan: string; onClose: () => void }) {
  return (
    <div className="space-y-4 text-center">
      <div className="text-6xl">🎉</div>
      <h3 className="font-black text-slate-900 text-lg">{plan === 'family' ? 'Family 版已开通' : 'Pro 版已开通'}</h3>
      <p className="text-sm text-slate-500">感谢您的支持！功能已立即解锁。</p>
      <div className="bg-blue-50 rounded-xl p-4 text-left text-sm text-slate-600 space-y-1">
        <p>• 无限拍照识别，不再限次数</p>
        <p>• 无限 AI 讲解和同类题</p>
        <p>• {plan === 'family' ? '支持最多 5 个孩子' : '享受全部 Pro 功能'}</p>
      </div>
      <button
        onClick={onClose}
        className="w-full py-3.5 rounded-xl text-white font-black text-base"
        style={{ background: 'linear-gradient(135deg, #2563EB, #7C3AED)' }}
      >
        开始使用
      </button>
    </div>
  )
}

// ─── 手动充值流程 ──────────────────────────────────────────────────────────────
function ManualPayment({ plan, onClose, onSuccess }: {
  plan: 'pro' | 'family'
  onClose: () => void
  onSuccess: () => void
}) {
  const [step, setStep] = useState<'qr' | 'contact' | 'waiting'>('qr')
  const [submitting, setSubmitting] = useState(false)

  const handleConfirm = async () => {
    setSubmitting(true)
    try {
      await api.subscription.upgrade({
        plan,
        payMethod: 'wechat',
        screenshotUrl: 'pending',
      })
      setStep('waiting')
      onSuccess()
    } catch {
      alert('提交失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      {step === 'qr' && (
        <>
          <div className="text-center">
            <p className="text-sm text-slate-500 mb-1">
              支付 <span className="font-black text-slate-900">¥{plan === 'pro' ? '18' : '28'}</span>/月
              {' '}或{' '}
              <span className="font-black text-slate-900">¥{plan === 'pro' ? '148' : '238'}</span>/年
            </p>
            <p className="text-xs text-slate-400 mt-1">微信扫码支付 · 人工审核后开通</p>
          </div>

          {/* 微信支付收款码 */}
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
            <img
              src={payQrCode}
              alt="微信支付收款码"
              className="w-48 h-auto mx-auto rounded-xl"
            />
            <p className="text-xs text-green-700 mt-2 font-bold">扫码支付给「鹏程包装-铜板」</p>
            <p className="text-[10px] text-green-500 mt-0.5">支付后点击下方按钮确认</p>
          </div>

          {/* 添加微信好友（用于提交凭证） */}
          <div className="bg-purple-50 border border-purple-200 rounded-2xl p-3 flex items-center gap-3">
            <img
              src={contactQrCode}
              alt="添加微信"
              className="w-16 h-auto rounded-lg shrink-0"
            />
            <div className="text-left">
              <p className="text-xs font-black text-slate-800">扫码添加微信</p>
              <p className="text-[10px] text-slate-500 mt-0.5">支付后添加好友，发送支付截图 & 手机号</p>
              <p className="text-[10px] text-slate-400">联系人：鹏程包装-铜板 · 15336839896</p>
            </div>
          </div>

          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="w-full py-3.5 rounded-xl text-white font-black text-base"
            style={{ background: 'linear-gradient(135deg, #2563EB, #7C3AED)' }}
          >
            {submitting ? '提交中…' : '✅ 我已支付，确认开通'}
          </button>

          <button
            onClick={() => setStep('contact')}
            className="w-full text-sm text-slate-400 py-2"
          >
            还没有付款？先查看联系方式
          </button>
        </>
      )}

      {step === 'contact' && (
        <>
          <div className="text-center py-2">
            <p className="text-sm font-black text-slate-800">管理员联系方式</p>
            <p className="text-xs text-slate-400 mt-1">添加微信后发送：支付截图 + 您的手机号</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-2xl">👤</span>
              <div>
                <p className="text-sm font-bold text-slate-800">鹏程包装-铜板</p>
                <p className="text-xs text-slate-400">浙江 舟山</p>
              </div>
            </div>
            <div className="h-px bg-slate-100" />
            <p className="text-sm text-slate-700"><span className="font-bold">手机/微信：</span>15336839896</p>
            <div className="h-px bg-slate-100" />
            <p className="text-xs text-slate-400">微信二维码已展示在上一步，直接扫码添加即可</p>
          </div>

          <button
            onClick={() => setStep('qr')}
            className="w-full py-3 rounded-xl text-white font-bold"
            style={{ background: 'linear-gradient(135deg, #2563EB, #7C3AED)' }}
          >
            ← 返回支付页面
          </button>
        </>
      )}

      {step === 'waiting' && (
        <UpgradeSuccess plan={plan} onClose={onClose} />
      )}
    </div>
  )
}

// ─── 主组件 ────────────────────────────────────────────────────────────────────
export default function UpgradeModal({ onClose, initialAction }: UpgradeModalProps) {
  const [selectedPlan, setSelectedPlan] = useState<'pro' | 'family' | null>(null)
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null)
  const [loading, setLoading] = useState(true)

  // 加载当前订阅状态
  React.useEffect(() => {
    api.subscription.getMe()
      .then(setSubscription)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // 若当前已是付费用户，直接关弹窗（不需要再升级）
  if (subscription?.isPaid) {
    return null
  }

  const handleUpgrade = (plan: 'pro' | 'family') => {
    setSelectedPlan(plan)
  }

  const handleSuccess = () => {
    // 刷新订阅状态
    api.subscription.getMe().then(setSubscription).catch(() => {})
  }

  if (selectedPlan) {
    return (
      <div className="fixed inset-0 z-50 flex items-end">
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />
        <div className="relative w-full bg-white rounded-t-3xl p-6 space-y-4 max-h-[85vh] overflow-y-auto">
          <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-2" />
          <div className="flex items-center justify-between">
            <h3 className="font-black text-slate-900 text-base">
              {selectedPlan === 'pro' ? '升级 Pro 版' : '升级 Family 版'}
            </h3>
            <button onClick={() => setSelectedPlan(null)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
              ← 返回
            </button>
          </div>
          <ManualPayment
            plan={selectedPlan}
            onClose={onClose}
            onSuccess={handleSuccess}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full bg-white rounded-t-3xl p-6 space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-2" />

        {/* 标题 */}
        <div className="text-center">
          <h3 className="font-black text-slate-900 text-base">解锁无限功能</h3>
          <p className="text-xs text-slate-400 mt-1">
            {initialAction === 'ocr'
              ? '今日 OCR 次数已用完'
              : initialAction === 'ai_analyze'
              ? '今日 AI 讲解次数已用完'
              : initialAction === 'ai_similar'
              ? '今日同类题次数已用完'
              : '升级解锁全部功能'}
          </p>
        </div>

        {/* 套餐卡片 */}
        <div className="space-y-3">
          {PLANS.map((plan) => (
            <button
              key={plan.key}
              onClick={() => plan.key !== 'free' && handleUpgrade(plan.key)}
              disabled={plan.key === 'free'}
              className={`w-full rounded-2xl p-4 text-left transition-all ${
                plan.highlight
                  ? 'ring-2 ring-blue-500 bg-blue-50'
                  : plan.key === 'free'
                  ? 'bg-slate-50 opacity-70 cursor-default'
                  : 'bg-white border border-slate-100 shadow-sm active:scale-[0.98]'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs font-black text-white px-2 py-0.5 rounded-full"
                    style={{ background: plan.gradient }}
                  >
                    {plan.label}
                  </span>
                  {plan.tag && (
                    <span className="text-[10px] font-black text-white bg-red-500 px-1.5 py-0.5 rounded-full">
                      {plan.tag}
                    </span>
                  )}
                </div>
                {plan.monthlyPrice > 0 && (
                  <div className="text-right">
                    <div className="text-lg font-black" style={{ color: plan.color }}>
                      ¥{plan.yearlyPrice}/年
                    </div>
                    <div className="text-[10px] text-slate-400">
                      或 ¥{plan.monthlyPrice}/月
                    </div>
                  </div>
                )}
                {plan.monthlyPrice === 0 && (
                  <span className="text-sm font-bold text-slate-400">免费</span>
                )}
              </div>
              <ul className="space-y-1">
                {plan.features.map((f, i) => (
                  <li key={i} className="text-xs text-slate-500 flex items-start gap-1.5">
                    <span className="text-green-500 shrink-0">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
            </button>
          ))}
        </div>

        {/* 7 天体验提示（仅免费版新用户） */}
        {subscription?.plan === 'free' && (
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3">
            <span className="text-2xl">🎁</span>
            <div className="flex-1">
              <p className="text-xs font-bold text-amber-800">新用户专享：7 天 Pro 免费体验</p>
              <p className="text-[10px] text-amber-600 mt-0.5">体验期内可无限使用所有 AI 功能</p>
            </div>
            <button
              onClick={() => handleUpgrade('pro')}
              className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-black text-white"
              style={{ background: 'linear-gradient(135deg, #F59E0B, #EF4444)' }}
            >
              立即领取
            </button>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full py-3 text-sm text-slate-400 font-bold"
        >
          暂不需要，继续免费版
        </button>
      </div>
    </div>
  )
}
