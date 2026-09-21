import type { BusRoute } from '../models/index'

/** 微信运行时使用的线路数据 Adapter。 */
export const routes: readonly BusRoute[] = [
  { id: 'route_1', name: '1路', serviceType: 'flexible_campus_bus', allowIntermediateStop: true, dataStatus: 'needs_review', directions: [
    { name: '图示正向', isLoop: false, stopIds: ['jingguanyuan', 'gate_6', 'gate_2', 'building_8', 'tianjiabing', 'yuanding', 'gate_5'] },
    { name: '图示反向', isLoop: false, stopIds: ['gate_5', 'yuanding', 'tianjiabing', 'building_8', 'gate_2', 'gate_6', 'jingguanyuan'] },
  ] },
  { id: 'route_2', name: '2路', serviceType: 'flexible_campus_bus', allowIntermediateStop: true, dataStatus: 'needs_review', directions: [
    { name: '图示正向', isLoop: false, stopIds: ['jingguanyuan', 'gate_6', 'gate_2', 'building_8', 'tianjiabing', 'xishijie', 'gate_5'] },
    { name: '图示反向', isLoop: false, stopIds: ['gate_5', 'xishijie', 'tianjiabing', 'building_8', 'gate_2', 'gate_6', 'jingguanyuan'] },
  ] },
  { id: 'route_3', name: '3路', serviceType: 'flexible_campus_bus', allowIntermediateStop: true, dataStatus: 'needs_review', directions: [
    { name: '图示正向', isLoop: false, stopIds: ['zhuyuan', 'gate_2', 'building_5', 'meiyuan', 'juyuan', 'gate_5'] },
    { name: '图示反向', isLoop: false, stopIds: ['gate_5', 'juyuan', 'meiyuan', 'building_5', 'gate_2', 'zhuyuan'] },
  ] },
  { id: 'route_4', name: '4路', serviceType: 'flexible_campus_bus', allowIntermediateStop: true, dataStatus: 'needs_review', directions: [
    { name: '图示正向', isLoop: false, stopIds: ['gate_2', 'canteen_2', 'geosciences', 'foreign_languages', 'building_26', 'meiyuan', 'juyuan'] },
    { name: '图示反向', isLoop: false, stopIds: ['juyuan', 'meiyuan', 'building_26', 'foreign_languages', 'geosciences', 'canteen_2', 'gate_2'] },
  ] },
  { id: 'route_5', name: '5路', serviceType: 'flexible_campus_bus', allowIntermediateStop: true, dataStatus: 'needs_review', directions: [
    { name: '图示正向', isLoop: false, stopIds: ['gate_2', 'building_8', 'tianjiabing', 'yuanding', 'gate_5'] },
    { name: '图示反向', isLoop: false, stopIds: ['gate_5', 'yuanding', 'tianjiabing', 'building_8', 'gate_2'] },
  ] },
  { id: 'route_6', name: '6路', serviceType: 'flexible_campus_bus', allowIntermediateStop: true, dataStatus: 'needs_review', directions: [
    { name: '图示顺序', isLoop: true, allowedRepeatedStopIds: ['gate_2'], stopIds: ['zhuyuan', 'gate_2', 'meiyuan', 'juyuan', 'tianjiabing', 'building_8', 'gate_2', 'zhuyuan'] },
    { name: '图示逆序', isLoop: true, allowedRepeatedStopIds: ['gate_2'], stopIds: ['zhuyuan', 'gate_2', 'building_8', 'tianjiabing', 'juyuan', 'meiyuan', 'gate_2', 'zhuyuan'] },
  ] },
  { id: 'route_7', name: '7路', serviceType: 'flexible_campus_bus', allowIntermediateStop: true, dataStatus: 'needs_review', directions: [
    { name: '图示顺序', isLoop: true, stopIds: ['gate_2', 'geosciences', 'building_5', 'building_26', 'meiyuan', 'juyuan', 'tianjiabing', 'liyuan', 'auditorium', 'gate_2'] },
    { name: '图示逆序', isLoop: true, stopIds: ['gate_2', 'auditorium', 'liyuan', 'tianjiabing', 'juyuan', 'meiyuan', 'building_26', 'building_5', 'geosciences', 'gate_2'] },
  ] },
  { id: 'route_8', name: '8路', serviceType: 'flexible_campus_bus', allowIntermediateStop: true, dataStatus: 'needs_review', directions: [
    { name: '图示顺序', isLoop: true, stopIds: ['music_school', 'building_8', 'tianjiabing', 'juyuan', 'meiyuan', 'foreign_languages', 'music_school'] },
    { name: '图示逆序', isLoop: true, stopIds: ['music_school', 'foreign_languages', 'meiyuan', 'juyuan', 'tianjiabing', 'building_8', 'music_school'] },
  ] },
  { id: 'route_9', name: '9路', serviceType: 'flexible_campus_bus', allowIntermediateStop: true, dataStatus: 'needs_review', directions: [
    { name: '图示顺序', isLoop: true, allowedRepeatedStopIds: ['gate_2'], stopIds: ['zhuyuan', 'gate_2', 'building_8', 'tianjiabing', 'yuanding', 'gate_5', 'juyuan', 'meiyuan', 'zhongtu', 'gate_2', 'zhuyuan'] },
    { name: '图示逆序', isLoop: true, allowedRepeatedStopIds: ['gate_2'], stopIds: ['zhuyuan', 'gate_2', 'zhongtu', 'meiyuan', 'juyuan', 'gate_5', 'yuanding', 'tianjiabing', 'building_8', 'gate_2', 'zhuyuan'] },
  ] },
]
