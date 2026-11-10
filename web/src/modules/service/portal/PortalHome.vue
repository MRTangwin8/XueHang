<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { onMounted, ref } from 'vue'
import { useAuth } from '@/stores/auth'
import { fmtDateTime, fmtTime, tz } from '@/utils/time'
import { money, printMoney } from '@/utils/format'
import DictTag from '@/components/DictTag.vue'
import { portalApi } from '../api'
import PortalSurface from './components/PortalSurface.vue'

const { t: tr } = useI18n()
const auth = useAuth()
const data = ref<Awaited<ReturnType<typeof portalApi.home>>>()
const loading = ref(false)
const failed = ref(false)
async function load() {
  loading.value = true
  failed.value = false
  try {
    data.value = await portalApi.home()
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}
onMounted(load)
</script>

<template>
  <div class="page">
    <PortalSurface>
      <div class="page-card welcome">
        <div class="meta">{{ tz().format(tr('service.text.mmmDDddd')) }}</div>
        <h2>{{ tr('service.text.hello2', { name: auth.me?.name }) }}</h2>
        <p>{{ tr('service.text.bookConsultationsAndTrackYourRequestsHereSoYou') }}</p>
        <router-link to="/portal/files">
          <el-button type="primary" size="large" icon="Download">{{ tr('service.text.resources') }}</el-button>
        </router-link>
      </div>
      <el-alert v-if="failed" :title="tr('service.text.couldNotLoadTheHomePagePleaseTryAgain')" type="error" :closable="false">
        <el-button link @click="load">{{ tr('service.text.retry') }}</el-button>
      </el-alert>
      <div v-loading="loading">
        <section class="page-card">
          <div class="section-head">
            <h3 class="page-title">{{ tr('service.text.latestNotices') }}</h3>
            <router-link to="/portal/notices">{{ tr('service.text.more') }}</router-link>
          </div>
          <router-link v-for="n in data?.notices" :key="n.id" :to="`/portal/notices/${n.id}`" class="list-link">
            <el-tag v-if="n.pinned" size="small">{{ tr('service.text.pinned') }}</el-tag>
            {{ n.title }}
            <div class="meta">{{ fmtDateTime(n.publishedAt) }}</div>
          </router-link>
          <el-empty v-if="data && !data.notices.length" :description="tr('service.text.noNotices')" :image-size="60" />
        </section>
        <section class="page-card">
          <div class="section-head">
            <h3 class="page-title">{{ tr('service.text.myConsultationsInterviews') }}</h3>
            <router-link to="/portal/interviews">{{ tr('service.text.viewBookings') }}</router-link>
          </div>
          <div class="card-grid">
            <article v-for="b in data?.bookings" :key="b.id" class="item-card">
              <h4>{{ b.kind === 'EXAM' ? tr('service.text.interview') : tr('service.text.consultation') }}
                ·
                {{ b.title }}</h4>
              <p class="accent">{{ fmtDateTime(b.startAt) }}
                –
                {{ fmtTime(b.endAt) }}</p>
              <div class="meta">
                {{ b.host.name }}
                ·
                {{ b.online ? tr('service.text.online') : b.location || b.campus?.name || tr('service.text.locationToBeAnnounced') }}
              </div>
            </article>
          </div>
          <el-empty v-if="data && !data.bookings.length" :description="tr('service.text.noUpcomingBookings')" :image-size="60" />
        </section>
        <div class="card-grid">
          <section class="page-card">
            <div class="section-head">
              <h3 class="page-title">{{ tr('service.text.documentProgress') }}</h3>
              <router-link to="/portal/documents">{{ tr('service.text.more') }}</router-link>
            </div>
            <div v-for="d in data?.documents" :key="d.id" class="list-link">
              <div class="row">
                <span>{{ d.title }}</span>
                <DictTag dict="docStatuses" :value="d.status" />
              </div>
              <div class="meta">
                {{ d.returnedAt ? tr('service.text.returnedOn') + fmtDateTime(d.returnedAt) : tr('service.text.expectedReturn') + fmtDateTime(d.dueAt) }}
              </div>
            </div>
            <el-empty v-if="data && !data.documents.length" :description="tr('service.text.noDocumentRequests')" :image-size="60" />
          </section>
          <section class="page-card">
            <div class="section-head">
              <h3 class="page-title">{{ tr('service.text.printProgress') }}</h3>
              <router-link to="/portal/prints">{{ tr('service.text.more') }}</router-link>
            </div>
            <div v-for="p in data?.prints" :key="p.id" class="list-link">
              <div class="row">
                <span>{{ p.fileName }}</span>
                <DictTag dict="printStatuses" :value="p.status" />
              </div>
              <div class="meta">{{ printMoney(p.fee) }} · {{ tr('service.text.collectAfter', { time: fmtDateTime(p.readyAt) }) }}</div>
            </div>
            <el-empty v-if="data && !data.prints.length" :description="tr('service.text.noPrintedMaterialsAwaitingCollection')" :image-size="60" />
          </section>
        </div>
      </div>
    </PortalSurface>
  </div>
</template>

<style scoped>
.welcome {
  background: linear-gradient(120deg, var(--xh-primary-soft), var(--xh-card));
  border-top: 3px solid var(--xh-primary);
}
.welcome h2 {
  margin: 10px 0;
  font-size: 24px;
}
.welcome p {
  color: var(--xh-text-2);
  line-height: 1.8;
}
</style>
