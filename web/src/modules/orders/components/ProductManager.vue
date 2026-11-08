<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/** 课程产品管理：type=SINGLE 单期课程 / PACKAGE 套餐课程（可选择包含的单期课程） */
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import DictSelect from '@/components/DictSelect.vue'
import CampusSelect from '@/components/CampusSelect.vue'
import { money, hours, useIsMobile, useDialogWidth } from '@/utils/format'
import { ordersApi, type Product, type ProductInput } from '../api'

const { t } = useI18n()

const props = defineProps<{ type: 'SINGLE' | 'PACKAGE' }>()
const isPkg = computed(() => props.type === 'PACKAGE')
const isMobile = useIsMobile()
const dlgWidth = useDialogWidth('620px')
const noun = computed(() => (isPkg.value ? t('orders.messages.package') : t('orders.messages.singleTermCourse')))

const rows = ref<Product[]>([])
const singles = ref<Product[]>([])
const loading = ref(false)
const q = ref('')
const onlyActive = ref(false)

async function load() {
  loading.value = true
  try {
    rows.value = await ordersApi.products({ type: props.type, q: q.value || undefined, active: onlyActive.value ? true : undefined })
    if (isPkg.value) singles.value = await ordersApi.products({ type: 'SINGLE' })
  } finally {
    loading.value = false
  }
}
onMounted(load)

const dlg = ref(false)
const editingId = ref<number | null>(null)
const formRef = ref<FormInstance>()
const empty = (): ProductInput => ({
  type: props.type, name: '', category: null, price: 0, originalPrice: null, vipHours: null, description: null, active: true, sort: 50, campusId:
    null, itemIds: [],
})
const form = reactive<ProductInput>(empty())
const rules = computed<FormRules>(() => ({
  name: [{ required: true, whitespace: true, message: t('orders.messages.enterAName'), trigger: 'blur' }],
  price: [{ required: true, message: t('orders.messages.enterAPrice'), trigger: 'blur' }],
}))
/** el-table 插槽 row 类型为 DefaultRow，这里收窄 */
const P = (r: unknown) => r as Product
const itemsSum = computed(() => singles.value.filter((s) => form.itemIds.includes(s.id)).reduce((t, s) => t + s.price, 0))

function openCreate() {
  Object.assign(form, empty())
  editingId.value = null
  dlg.value = true
}
function openEdit(p: Product) {
  Object.assign(form, {
    type: p.type, name: p.name, category: p.category, price: p.price, originalPrice: p.originalPrice, vipHours: p.vipHours,
    description: p.description, active: p.active, sort: p.sort, campusId: p.campusId, itemIds: [...p.itemIds],
  })
  editingId.value = p.id
  dlg.value = true
}
async function save() {
  if (!(await formRef.value?.validate().catch(() => false))) return
  const body: ProductInput = { ...form, name: form.name.trim(), itemIds: isPkg.value ? form.itemIds : [] }
  if (editingId.value) await ordersApi.updateProduct(editingId.value, body)
  else await ordersApi.createProduct(body)
  ElMessage.success(t('common.saved'))
  dlg.value = false
  load()
}
async function toggleActive(p: Product) {
  await ordersApi.updateProduct(p.id, { ...p, active: !p.active, itemIds: p.itemIds })
  ElMessage.success(p.active ? t('orders.messages.disabled') : t('orders.messages.enabled'))
  load()
}
async function remove(p: Product) {
  await ElMessageBox.confirm(t('orders.messages.deleteExistingOrdersWillNotBeAffected', { p1: noun.value, p2: p.name }), t('common.delete'), { type:
    'warning' })
  await ordersApi.deleteProduct(p.id)
  ElMessage.success(t('common.deleted'))
  load()
}
</script>

<template>
  <div class="page-card">
    <div class="toolbar">
      <el-input
        v-model="q"
        :placeholder="t('orders.messages.searchName', { p1: noun })"
        clearable
        prefix-icon="Search"
        style="width: 220px"
        @keyup.enter="load"
        @clear="load"
      />
      <el-checkbox v-model="onlyActive" @change="load">{{ t('orders.messages.enabledOnly') }}</el-checkbox>
      <span class="spacer" />
      <el-button type="primary" icon="Plus" @click="openCreate">{{ t('orders.messages.add', { p1: noun }) }}</el-button>
    </div>
    <div v-if="isMobile" v-loading="loading" class="cards">
      <el-empty v-if="!rows.length && !loading" :description="t('orders.messages.no', { p1: noun })" />
      <div v-for="p in rows" :key="p.id" class="p-card" :class="{ off: !p.active }">
        <div class="p-top"><b>{{ p.name }}</b><span class="spacer" /><span class="price">{{ money(p.price) }}</span></div>
        <div v-if="isPkg && p.items.length" class="p-line">{{ t('orders.messages.includes', { p1: p.items.map((i) => i.name).join('、') }) }}</div>
        <div class="p-line muted">
          {{ p.category || t('orders.messages.uncategorized') }}
          <template v-if="p.vipHours">
            · VIP
            {{ hours(p.vipHours) }}
          </template>
          ·
          {{ p.active ? t('orders.messages.enable') : t('orders.messages.disable') }}
        </div>
        <div class="p-actions">
          <el-button size="small" @click="openEdit(p)">{{ t('common.edit') }}</el-button>
          <el-button size="small" @click="toggleActive(p)">{{ p.active ? t('orders.messages.disable') : t('orders.messages.enable') }}</el-button>
          <el-button size="small" type="danger" plain @click="remove(p)">{{ t('common.delete') }}</el-button>
        </div>
      </div>
    </div>
    <el-table v-else v-loading="loading" :data="rows">
      <el-table-column prop="name" :label="t('orders.messages.name2', { p1: noun })" min-width="200" />
      <el-table-column prop="category" :label="t('orders.messages.subjectCategory')" width="110" />
      <el-table-column :label="t('orders.messages.price')" width="120" align="right">
        <template #default="{ row }">
          {{ money(row.price) }}
        </template>
      </el-table-column>
      <template v-if="isPkg">
        <el-table-column :label="t('orders.messages.listPrice')" width="120" align="right">
          <template #default="{ row }">
            {{ row.originalPrice ? money(row.originalPrice) : '' }}
          </template>
        </el-table-column>
        <el-table-column :label="t('orders.messages.includesVip')" width="80">
          <template #default="{ row }">
            {{ hours(row.vipHours) }}
          </template>
        </el-table-column>
        <el-table-column :label="t('orders.messages.includedSingleTermCourses')" min-width="240">
          <template #default="{ row }">
            <el-tag v-for="i in row.items" :key="i.id" size="small" effect="plain" class="item-tag" disable-transitions>{{ i.name }}</el-tag>
            <span v-if="!row.items.length" class="muted">—</span>
          </template>
        </el-table-column>
      </template>
      <el-table-column :label="t('common.campus')" width="100">
        <template #default="{ row }">
          {{ row.campus?.name ?? t('orders.messages.allCampuses') }}
        </template>
      </el-table-column>
      <el-table-column prop="sort" :label="t('orders.messages.sortOrder')" width="70" />
      <el-table-column :label="t('orders.messages.enable')" width="70">
        <template #default="{ row }">
          <el-switch :model-value="row.active" size="small" @change="toggleActive(P(row))" />
        </template>
      </el-table-column>
      <el-table-column :label="t('common.operation')" width="120" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(P(row))">{{ t('common.edit') }}</el-button>
          <el-button link type="danger" @click="remove(P(row))">{{ t('common.delete') }}</el-button>
        </template>
      </el-table-column>
      <template #empty><el-empty :description="t('orders.messages.no', { p1: noun })" /></template>
    </el-table>
    <el-dialog
      v-model="dlg"
      :title="t(editingId ? 'orders.messages.editItem' : 'orders.messages.add', { p1: noun })"
      :width="dlgWidth"
      :close-on-click-modal="false"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px" :label-position="isMobile ? 'top' : 'right'">
        <el-form-item :label="t('orders.messages.name')" prop="name"><el-input v-model="form.name" maxlength="60" /></el-form-item>
        <el-form-item :label="t('orders.messages.subjectCategory')">
          <DictSelect v-model="form.category" dict="subjectCategories" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="t('orders.messages.price')" prop="price">
          <el-input-number v-model="form.price" :min="0" :step="1000" :controls="false" style="width: 100%" />
        </el-form-item>
        <template v-if="isPkg">
          <el-form-item :label="t('orders.messages.listPrice')">
            <el-input-number v-model="form.originalPrice" :min="0" :step="1000" :controls="false" style="width: 100%" />
          </el-form-item>
          <el-form-item :label="t('orders.messages.includedVipHours')">
            <el-input-number v-model="form.vipHours" :min="0" :step="1" :precision="1" style="width: 100%" />
          </el-form-item>
          <el-form-item :label="t('orders.messages.includedSingleTermCourses')">
            <el-select v-model="form.itemIds" multiple filterable :placeholder="t('orders.messages.selectIncludedSingleTermCourses')" style="width: 100%">
              <el-option v-for="s in singles" :key="s.id" :value="s.id" :label="s.name">
                <span>{{ s.name }}</span>
                <span class="muted" style="float: right">{{ money(s.price) }}</span>
              </el-option>
            </el-select>
            <div v-if="form.itemIds.length" class="muted">{{ t('orders.messages.singleTermCourseTotal', { p1: money(itemsSum) }) }}</div>
          </el-form-item>
        </template>
        <el-form-item :label="t('common.campus')">
          <CampusSelect v-model="form.campusId" :placeholder="t('orders.messages.leaveEmptyForAllCampuses')" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="t('orders.messages.description')"><el-input v-model="form.description" type="textarea" :rows="2" /></el-form-item>
        <el-form-item :label="t('orders.messages.sortOrder')"><el-input-number v-model="form.sort" :min="0" :max="9999" /></el-form-item>
        <el-form-item :label="t('orders.messages.enable')"><el-switch v-model="form.active" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="save">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.item-tag { margin: 2px 4px 2px 0; }
.cards { display: grid; gap: 10px; min-height: 100px; }
.p-card { border: 1px solid var(--xh-border); border-radius: 10px; padding: 12px; display: grid; gap: 6px; }
.p-card.off { opacity: 0.6; }
.p-top { display: flex; align-items: center; gap: 8px; }
.p-top .spacer { flex: 1; }
.price { color: var(--xh-primary); font-weight: 700; }
.p-line { font-size: 13px; }
.p-actions { display: flex; gap: 8px; justify-content: flex-end; }
</style>
