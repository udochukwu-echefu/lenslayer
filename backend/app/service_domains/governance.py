from __future__ import annotations

from .base import (
    Any, Contract, ContractActivityResponse, ContractDecision, ContractReview, HTTPException,
    LifecycleItem, Membership, Notification, NotificationResponse, PlatformAuditEvent,
    PortfolioQuestionResponse, PortfolioQuestionSource, ProcessingJob, ReportActivityItem,
    ReportDistributionItem, ReportOverviewResponse, ReportTimelinePoint, ReportWorkloadItem,
    User, WorkflowTask, aware, csv, datetime, io, json_dump, json_load, math,
    normalized_role, select, timedelta, utcnow,
)
from ..document_intelligence import PortfolioDocument


class GovernanceServiceMixin:
    def contract_activity(
        self,
        organization_id: str,
        contract_id: str,
        user: User,
        limit: int = 200,
    ) -> list[ContractActivityResponse]:
        self.contracts.get_contract(organization_id, contract_id, user)
        rows = self.session.execute(
            select(PlatformAuditEvent, User.display_name, User.email)
            .outerjoin(User, User.id == PlatformAuditEvent.actor_user_id)
            .where(
                PlatformAuditEvent.organization_id == organization_id,
                PlatformAuditEvent.contract_id == contract_id,
            )
            .order_by(PlatformAuditEvent.created_at.desc())
            .limit(min(max(limit, 1), 500))
        ).all()
        return [
            ContractActivityResponse(
                id=event.id,
                action=event.action,
                detail=json_load(event.detail_json, {}),
                actor_user_id=event.actor_user_id,
                actor_name=display_name or email or "LensLayer system",
                created_at=event.created_at,
            )
            for event, display_name, email in rows
        ]

    def portfolio_question(
        self,
        organization_id: str,
        user: User,
        question: str,
    ) -> PortfolioQuestionResponse:
        self.workspace.membership(organization_id, user)
        reviews = self.session.execute(
            select(Contract, ContractReview)
            .join(ContractReview, ContractReview.contract_id == Contract.id)
            .where(Contract.organization_id == organization_id)
        ).all()
        documents = [
            PortfolioDocument(
                contract_id=contract.id,
                title=contract.title,
                text=review.source_text or json_dump(json_load(review.analysis_json, {})),
            )
            for contract, review in reviews
        ]
        result = self.review_workflow.answer_portfolio(documents, question)
        sources = [
            PortfolioQuestionSource(
                contract_id=source.contract_id or "",
                contract_title=source.contract_title or "",
                location=source.location,
                excerpt=source.excerpt,
            )
            for source in result.sources
        ]
        if not sources:
            return PortfolioQuestionResponse(
                answer=result.answer,
                sources=[],
                generated_by=result.generated_by,
            )
        self._audit(
            organization_id,
            user.id,
            "portfolio.question_answered",
            detail={
                "question": question[:240],
                "source_count": len(sources),
                "generated_by": result.generated_by,
            },
        )
        self.session.commit()
        return PortfolioQuestionResponse(
            answer=result.answer,
            sources=sources,
            generated_by=result.generated_by,
        )

    def list_notifications(
        self,
        organization_id: str,
        user: User,
        unread_only: bool = False,
        limit: int = 30,
    ) -> list[Notification]:
        self.workspace.membership(organization_id, user)
        query = select(Notification).where(
            Notification.organization_id == organization_id,
            Notification.user_id == user.id,
        )
        if unread_only:
            query = query.where(Notification.read_at.is_(None))
        return list(
            self.session.scalars(
                query.order_by(Notification.created_at.desc()).limit(min(max(limit, 1), 100))
            ).all()
        )

    def mark_notification_read(
        self,
        organization_id: str,
        notification_id: str,
        user: User,
    ) -> Notification:
        self.workspace.membership(organization_id, user)
        notification = self.session.scalar(
            select(Notification).where(
                Notification.id == notification_id,
                Notification.organization_id == organization_id,
                Notification.user_id == user.id,
            )
        )
        if notification is None:
            raise HTTPException(status_code=404, detail="Notification not found.")
        if notification.read_at is None:
            notification.read_at = utcnow()
            self.session.commit()
            self.session.refresh(notification)
        return notification

    def mark_all_notifications_read(self, organization_id: str, user: User) -> None:
        for notification in self.list_notifications(organization_id, user, unread_only=True, limit=100):
            notification.read_at = utcnow()
        self.session.commit()

    @staticmethod
    def notification_response(notification: Notification) -> NotificationResponse:
        return NotificationResponse(
            id=notification.id,
            organization_id=notification.organization_id,
            contract_id=notification.contract_id,
            kind=notification.kind,
            title=notification.title,
            message=notification.message,
            action_url=notification.action_url,
            read_at=notification.read_at,
            created_at=notification.created_at,
        )

    def list_audit_events(self, organization_id: str, user: User, limit: int = 100) -> list[PlatformAuditEvent]:
        self.workspace.membership(organization_id, user)
        return list(
            self.session.scalars(
                select(PlatformAuditEvent)
                .where(PlatformAuditEvent.organization_id == organization_id)
                .order_by(PlatformAuditEvent.created_at.desc())
                .limit(min(max(limit, 1), 250))
            ).all()
        )

    def report_overview(
        self,
        organization_id: str,
        user: User,
        range_name: str,
    ) -> ReportOverviewResponse:
        self.workspace.membership(organization_id, user)
        if range_name not in {"30d", "90d", "365d", "all"}:
            raise HTTPException(status_code=422, detail="Choose a 30 day, 90 day, 365 day, or all-time report.")

        generated_at = utcnow()
        range_days = {"30d": 30, "90d": 90, "365d": 365}
        period_start = generated_at - timedelta(days=range_days[range_name]) if range_name != "all" else None

        contracts = list(
            self.session.scalars(
                select(Contract)
                .where(Contract.organization_id == organization_id)
                .order_by(Contract.created_at.asc())
            ).all()
        )
        tasks = list(
            self.session.scalars(
                select(WorkflowTask)
                .where(WorkflowTask.organization_id == organization_id)
                .order_by(WorkflowTask.created_at.asc())
            ).all()
        )
        decisions = list(
            self.session.scalars(
                select(ContractDecision)
                .where(ContractDecision.organization_id == organization_id)
                .order_by(ContractDecision.created_at.asc())
            ).all()
        )
        processing_jobs = list(
            self.session.scalars(
                select(ProcessingJob)
                .where(
                    ProcessingJob.organization_id == organization_id,
                    ProcessingJob.kind == "contract_review",
                )
                .order_by(ProcessingJob.created_at.asc())
            ).all()
        )
        lifecycle_items = list(
            self.session.scalars(
                select(LifecycleItem)
                .where(
                    LifecycleItem.organization_id == organization_id,
                    LifecycleItem.status == "active",
                )
                .order_by(LifecycleItem.due_at.asc())
            ).all()
        )
        audit_events = list(
            self.session.scalars(
                select(PlatformAuditEvent)
                .where(PlatformAuditEvent.organization_id == organization_id)
                .order_by(PlatformAuditEvent.created_at.desc())
            ).all()
        )
        memberships = list(
            self.session.scalars(
                select(Membership)
                .join(User, User.id == Membership.user_id)
                .where(Membership.organization_id == organization_id)
                .order_by(User.display_name.asc(), User.email.asc())
            ).all()
        )

        def in_period(value: datetime) -> bool:
            return period_start is None or aware(value) >= period_start

        period_contracts = [item for item in contracts if in_period(item.created_at)]
        period_tasks = [item for item in tasks if in_period(item.created_at)]
        period_events = [item for item in audit_events if in_period(item.created_at)]

        active_tasks = [item for item in tasks if item.status in {"open", "in_progress"}]
        overdue_tasks = [
            item for item in active_tasks
            if item.due_at is not None and aware(item.due_at) < generated_at
        ]
        due_soon_cutoff = generated_at + timedelta(days=7)
        due_soon_tasks = [
            item for item in active_tasks
            if item.due_at is not None and generated_at <= aware(item.due_at) <= due_soon_cutoff
        ]
        completed_in_period = [
            item for item in tasks
            if item.status == "done" and item.completed_at is not None and in_period(item.completed_at)
        ]
        period_completed_tasks = [item for item in period_tasks if item.status == "done"]
        task_denominator = sum(1 for item in period_tasks if item.status != "cancelled")
        completed_review_jobs = [
            item for item in processing_jobs
            if item.completed_at is not None
            and item.started_at is not None
            and in_period(item.completed_at)
            and item.status == "succeeded"
        ]
        average_review_completion_hours = round(
            sum((aware(item.completed_at) - aware(item.started_at)).total_seconds() for item in completed_review_jobs)
            / len(completed_review_jobs)
            / 3600,
            1,
        ) if completed_review_jobs else 0
        obligation_cutoff = generated_at + timedelta(days=30)
        upcoming_obligations = sum(
            1 for item in lifecycle_items
            if generated_at <= aware(item.due_at) <= obligation_cutoff
        )
        material_findings: list[dict[str, Any]] = []
        for contract in period_contracts:
            if not contract.review:
                continue
            findings = json_load(contract.review.analysis_json, {}).get("risk_assessment", [])
            material_findings.extend(item for item in findings if isinstance(item, dict))
        evidence_backed_findings = sum(
            1 for item in material_findings
            if bool(item.get("quote"))
            or (
                isinstance(item.get("evidence"), dict)
                and bool(item["evidence"].get("quote") or item["evidence"].get("excerpt"))
            )
        )
        evidence_coverage = round((evidence_backed_findings / len(material_findings)) * 100) if material_findings else 0

        contract_type_counts: dict[str, int] = {}
        for contract in period_contracts:
            label = contract.contract_type.strip() or "Unknown"
            contract_type_counts[label] = contract_type_counts.get(label, 0) + 1

        priority_counts = {
            priority: sum(1 for task in active_tasks if task.priority == priority)
            for priority in ("high", "normal", "low")
        }

        timeline_start = period_start or self._earliest_report_time(
            generated_at,
            contracts,
            tasks,
            decisions,
        )
        timeline = self._report_timeline(
            timeline_start,
            generated_at,
            contracts,
            tasks,
            decisions,
            range_name,
        )

        workload = [
            ReportWorkloadItem(
                user_id=membership.user_id,
                display_name=membership.user.display_name,
                email=membership.user.email,
                role=normalized_role(membership.role),
                active_tasks=sum(
                    1 for task in active_tasks if task.assigned_to_user_id == membership.user_id
                ),
                overdue_tasks=sum(
                    1 for task in overdue_tasks if task.assigned_to_user_id == membership.user_id
                ),
                completed_in_period=sum(
                    1 for task in completed_in_period if task.assigned_to_user_id == membership.user_id
                ),
            )
            for membership in memberships
        ]

        actor_ids = {event.actor_user_id for event in period_events[:12] if event.actor_user_id}
        actors = {
            actor.id: actor
            for actor in self.session.scalars(select(User).where(User.id.in_(actor_ids))).all()
        } if actor_ids else {}
        contract_ids = {event.contract_id for event in period_events[:12] if event.contract_id}
        activity_contracts = {
            contract.id: contract
            for contract in self.session.scalars(select(Contract).where(Contract.id.in_(contract_ids))).all()
        } if contract_ids else {}
        recent_activity = [
            ReportActivityItem(
                id=event.id,
                action=event.action,
                detail=json_load(event.detail_json, {}),
                actor_user_id=event.actor_user_id,
                actor_name=actors[event.actor_user_id].display_name
                if event.actor_user_id in actors
                else "LensLayer system",
                contract_id=event.contract_id,
                contract_title=activity_contracts[event.contract_id].title
                if event.contract_id in activity_contracts
                else None,
                created_at=event.created_at,
            )
            for event in period_events[:12]
        ]

        return ReportOverviewResponse(
            organization_id=organization_id,
            range=range_name,
            generated_at=generated_at,
            period_start=period_start,
            period_end=generated_at,
            contracts_total=len(period_contracts),
            contracts_ready=sum(1 for item in period_contracts if item.status == "ready"),
            contracts_processing=sum(
                1 for item in period_contracts if item.status in {"queued", "processing", "running"}
            ),
            contracts_failed=sum(1 for item in period_contracts if item.status == "failed"),
            review_completed_count=len(completed_review_jobs),
            average_review_completion_hours=average_review_completion_hours,
            upcoming_obligations=upcoming_obligations,
            material_findings_total=len(material_findings),
            evidence_backed_findings=evidence_backed_findings,
            evidence_coverage=evidence_coverage,
            tasks_total=len(period_tasks),
            tasks_active=len(active_tasks),
            tasks_overdue=len(overdue_tasks),
            tasks_due_soon=len(due_soon_tasks),
            tasks_completed=len(completed_in_period),
            task_completion_rate=round((len(period_completed_tasks) / task_denominator) * 100)
            if task_denominator
            else 0,
            audit_event_count=len(period_events),
            contract_types=[
                ReportDistributionItem(label=label, count=count)
                for label, count in sorted(
                    contract_type_counts.items(),
                    key=lambda item: (-item[1], item[0].casefold()),
                )
            ],
            active_task_priorities=[
                ReportDistributionItem(label=priority, count=priority_counts[priority])
                for priority in ("high", "normal", "low")
            ],
            timeline=timeline,
            workload=sorted(
                workload,
                key=lambda item: (-item.overdue_tasks, -item.active_tasks, item.display_name.casefold()),
            ),
            recent_activity=recent_activity,
        )

    @staticmethod
    def report_csv(report: ReportOverviewResponse) -> str:
        from export_utils import csv_safe_cell

        output = io.StringIO()
        writer = csv.writer(output)

        def write_row(values: list[Any] | tuple[Any, ...]) -> None:
            writer.writerow([csv_safe_cell(value) for value in values])

        write_row(["LensLayer report", report.range, report.generated_at.isoformat()])
        write_row([])
        write_row(["Section", "Metric", "Value"])
        metrics = [
            ("Contracts", "Created", report.contracts_total),
            ("Contracts", "Ready", report.contracts_ready),
            ("Contracts", "Processing", report.contracts_processing),
            ("Contracts", "Failed", report.contracts_failed),
            ("Contracts", "Completed reviews", report.review_completed_count),
            ("Contracts", "Average review completion hours", report.average_review_completion_hours),
            ("Contracts", "Upcoming obligations in 30 days", report.upcoming_obligations),
            ("Evidence", "Material findings", report.material_findings_total),
            ("Evidence", "Cited findings", report.evidence_backed_findings),
            ("Evidence", "Coverage", f"{report.evidence_coverage}%"),
            ("Tasks", "Created", report.tasks_total),
            ("Tasks", "Currently active", report.tasks_active),
            ("Tasks", "Currently overdue", report.tasks_overdue),
            ("Tasks", "Due in seven days", report.tasks_due_soon),
            ("Tasks", "Completed in period", report.tasks_completed),
            ("Tasks", "Completion rate", f"{report.task_completion_rate}%"),
            ("Governance", "Audit events", report.audit_event_count),
        ]
        for metric in metrics:
            write_row(metric)
        write_row([])
        write_row(["Reviewer", "Email", "Role", "Active tasks", "Overdue tasks", "Completed in period"])
        for item in report.workload:
            write_row([
                item.display_name,
                item.email,
                item.role,
                item.active_tasks,
                item.overdue_tasks,
                item.completed_in_period,
            ])
        write_row([])
        write_row([
            "Period",
            "Contracts created",
            "Tasks created",
            "Tasks completed",
            "Human contract decisions",
        ])
        for point in report.timeline:
            write_row([
                point.label,
                point.contracts_created,
                point.tasks_created,
                point.tasks_completed,
                point.decisions_recorded,
            ])
        return output.getvalue()

    @staticmethod
    def _earliest_report_time(
        fallback: datetime,
        contracts: list[Contract],
        tasks: list[WorkflowTask],
        decisions: list[ContractDecision],
    ) -> datetime:
        values = (
            [aware(item.created_at) for item in contracts]
            + [aware(item.created_at) for item in tasks]
            + [aware(item.created_at) for item in decisions]
        )
        return min(values) if values else fallback - timedelta(days=30)

    @staticmethod
    def _report_timeline(
        period_start: datetime,
        period_end: datetime,
        contracts: list[Contract],
        tasks: list[WorkflowTask],
        decisions: list[ContractDecision],
        range_name: str,
    ) -> list[ReportTimelinePoint]:
        configured_days = {"30d": 5, "90d": 15, "365d": 31}
        if range_name == "all":
            span_days = max(1, math.ceil((period_end - period_start).total_seconds() / 86400))
            bucket_days = max(1, math.ceil(span_days / 8))
        else:
            bucket_days = configured_days[range_name]
        points: list[ReportTimelinePoint] = []
        cursor = period_start
        while cursor < period_end:
            bucket_end = min(cursor + timedelta(days=bucket_days), period_end)

            def inside(value: datetime | None) -> bool:
                return value is not None and cursor <= aware(value) < bucket_end

            points.append(
                ReportTimelinePoint(
                    label=cursor.strftime("%d %b"),
                    period_start=cursor,
                    period_end=bucket_end,
                    contracts_created=sum(1 for item in contracts if inside(item.created_at)),
                    tasks_created=sum(1 for item in tasks if inside(item.created_at)),
                    tasks_completed=sum(1 for item in tasks if inside(item.completed_at)),
                    decisions_recorded=sum(1 for item in decisions if inside(item.created_at)),
                )
            )
            cursor = bucket_end
        return points
